package main

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"mime/quotedprintable"
	"net"
	"net/http"
	"net/mail"
	"net/smtp"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type authMailJob struct {
	email   string
	purpose string
}

type authMessage struct {
	authMailJob
	token string
}

type sendAuthMail func(context.Context, authMessage) error

func (app *application) queueAuthMail(w http.ResponseWriter, job authMailJob) bool {
	select {
	case app.authMailJobs <- job:
		return true
	default:
		w.Header().Set("Retry-After", "30")
		fail(w, http.StatusServiceUnavailable, "auth_mail_busy")
		return false
	}
}

func (app *application) deliverAuthMail(ctx context.Context, send sendAuthMail) {
	for {
		select {
		case <-ctx.Done():
			return
		case job := <-app.authMailJobs:
			jobCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
			message := authMessage{authMailJob: job}
			var err error
			if job.purpose != "password-changed" {
				message.token, err = app.issueAuthToken(jobCtx, job)
			}
			if err == nil {
				err = send(jobCtx, message)
			}
			cancel()
			if err != nil && !errors.Is(err, pgx.ErrNoRows) && ctx.Err() == nil {
				log.Printf("auth mail %s failed: %T", job.purpose, err)
			}
		}
	}
}

func (app *application) issueAuthToken(ctx context.Context, job authMailJob) (string, error) {
	tx, err := app.db.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	var userID string
	err = tx.QueryRow(ctx, `SELECT id::text FROM users WHERE email=$1 AND
		(email_verified_at IS NULL)=($2='verify') FOR NO KEY UPDATE`, job.email, job.purpose).Scan(&userID)
	if err != nil {
		return "", err
	}
	lifetime := time.Hour
	if job.purpose == "verify" {
		lifetime = 24 * time.Hour
	}
	token, digest := newAuthSecret()
	_, err = tx.Exec(ctx, `INSERT INTO auth_tokens (token_hash,user_id,purpose,expires_at)
		VALUES ($1,$2::text::uuid,$3,now()+make_interval(secs=>$4::double precision))`,
		digest, userID, job.purpose, lifetime.Seconds())
	if err != nil {
		return "", err
	}
	return token, tx.Commit(ctx)
}

type smtpAuthMailer struct {
	addr, host, from   string
	username, password string
	implicitTLS        bool
}

func authMailSender(secureCookies bool) (sendAuthMail, error) {
	addr := strings.TrimSpace(os.Getenv("JOSPAT_SMTP_ADDR"))
	from := strings.TrimSpace(os.Getenv("JOSPAT_SMTP_FROM"))
	username := os.Getenv("JOSPAT_SMTP_USER")
	password := os.Getenv("JOSPAT_SMTP_PASSWORD")
	mode := strings.TrimSpace(os.Getenv("JOSPAT_SMTP_TLS"))
	if !secureCookies && addr == "" && from == "" && username == "" && password == "" && mode == "" {
		log.Print("local development: auth codes will be printed in the server console")
		return func(_ context.Context, message authMessage) error {
			log.Printf("local auth email to %s (%s)", message.email, message.purpose)
			if message.token != "" {
				log.Printf("local auth code: %s", message.token)
			}
			return nil
		}, nil
	}
	host, port, err := net.SplitHostPort(addr)
	if err != nil || host == "" || port == "" || !validEmail(from) ||
		username == "" || password == "" || (mode != "" && mode != "starttls" && mode != "implicit") {
		return nil, errors.New("configure JOSPAT_SMTP_ADDR, JOSPAT_SMTP_FROM, JOSPAT_SMTP_USER and JOSPAT_SMTP_PASSWORD (JOSPAT_SMTP_TLS: starttls or implicit)")
	}
	sender := smtpAuthMailer{addr: addr, host: host, from: from, username: username, password: password, implicitTLS: mode == "implicit"}
	return sender.send, nil
}

func (m smtpAuthMailer) send(ctx context.Context, message authMessage) error {
	dialer := &net.Dialer{}
	conn, err := dialer.DialContext(ctx, "tcp", m.addr)
	if err != nil {
		return err
	}
	defer conn.Close()
	// SMTP operations use the same deadline as connection establishment and TLS.
	if deadline, ok := ctx.Deadline(); ok {
		if err := conn.SetDeadline(deadline); err != nil {
			return err
		}
	}
	stop := context.AfterFunc(ctx, func() { _ = conn.Close() })
	defer stop()
	config := &tls.Config{ServerName: m.host, MinVersion: tls.VersionTLS12}
	var transport net.Conn = conn
	if m.implicitTLS {
		secureConn := tls.Client(conn, config)
		if err := secureConn.HandshakeContext(ctx); err != nil {
			return err
		}
		transport = secureConn
	}
	client, err := smtp.NewClient(transport, m.host)
	if err != nil {
		return err
	}
	defer client.Close()
	if !m.implicitTLS {
		if err := client.StartTLS(config); err != nil {
			return err
		}
	}
	if err := client.Auth(smtp.PlainAuth("", m.username, m.password, m.host)); err != nil {
		return err
	}
	if err := client.Mail(m.from); err != nil {
		return err
	}
	if err := client.Rcpt(message.email); err != nil {
		return err
	}
	body, err := client.Data()
	if err != nil {
		return err
	}
	if err := writeAuthMessage(body, m.from, message); err != nil {
		return err
	}
	if err := body.Close(); err != nil {
		return err
	}
	_ = client.Quit()
	return nil
}

func writeAuthMessage(w io.Writer, from string, message authMessage) error {
	var subject, body string
	switch message.purpose {
	case "verify":
		subject = "JOSPAT — подтверждение email"
		body = "Код подтверждения email JOSPAT:\r\n" + message.token + "\r\n\r\nКод действует 24 часа. Если вы не регистрировались, проигнорируйте это письмо.\r\n"
	case "reset":
		subject = "JOSPAT — восстановление пароля"
		body = "Код восстановления пароля JOSPAT:\r\n" + message.token + "\r\n\r\nКод действует один час. Если вы не запрашивали восстановление, проигнорируйте это письмо.\r\n"
	default:
		subject = "JOSPAT — пароль изменён"
		body = "Пароль вашей учётной записи JOSPAT изменён. Если вы не делали этого, запросите восстановление пароля.\r\n"
	}
	if _, err := fmt.Fprintf(w, "From: %s\r\nTo: %s\r\nDate: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n",
		(&mail.Address{Address: from}).String(), (&mail.Address{Address: message.email}).String(),
		time.Now().UTC().Format(time.RFC1123Z), mime.QEncoding.Encode("UTF-8", subject)); err != nil {
		return err
	}
	writer := quotedprintable.NewWriter(w)
	if _, err := io.WriteString(writer, body); err != nil {
		return err
	}
	return writer.Close()
}
