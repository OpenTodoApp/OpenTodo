# Spec Delta

## Purpose

Lets an operator connect an SMTP server so OpenTodo can send account email (sign-up verification and password reset) without any third-party service the operator did not choose.

## ADDED Requirements

### Requirement: Optional SMTP configuration
The operator SHALL be able to configure an SMTP server (host, port, TLS or STARTTLS, user, password, sender address) through optional environment variables or owner settings, with the password kept in the secrets directory. Without configuration, the server SHALL send no email and every feature SHALL behave as before. Mail SHALL go only to the configured SMTP server.

#### Scenario: Not configured
- **WHEN** no SMTP server is configured
- **THEN** no email is sent, password reset stays an admin-created link, and the settings show email as off

#### Scenario: Test message
- **WHEN** the owner configures SMTP and sends a test message to their own address
- **THEN** the message is delivered through the configured server, or the settings show the server's error

### Requirement: Sending limits and failures
Account email SHALL be rate limited per recipient address and per account. A failed delivery SHALL be logged and recorded in the audit log, SHALL NOT be retried more than a bounded number of times, and SHALL never reveal to the requester whether an address has an account.

#### Scenario: Repeated reset requests
- **WHEN** someone requests a password reset for the same address ten times in a minute
- **THEN** at most the allowed number of emails is sent, and every request gets the same neutral answer

#### Scenario: SMTP server down
- **WHEN** the SMTP server refuses connections while a verification email is sent
- **THEN** the failure is logged and audited, the sign-up stays pending, and the person can request the email again later
