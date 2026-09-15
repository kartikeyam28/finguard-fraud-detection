# Escalation Matrix

## 1. Escalation Levels

### Level 1: Fraud Analyst
**Handles**:
- Routine transaction alerts (score 0.3-0.6).
- False positive verification.
- Standard chargeback processing.

**SLA**: Respond within 4 hours, resolve within 24 hours.

### Level 2: Senior Fraud Investigator
**Handles**:
- High-priority alerts (score 0.6-0.8).
- Complex fraud patterns involving multiple accounts.
- Cross-channel fraud investigation.
- SAR preparation and filing.

**SLA**: Respond within 2 hours, resolve within 8 hours.

### Level 3: Fraud Manager / AML Officer
**Handles**:
- Critical alerts (score > 0.8).
- Suspected organized fraud rings.
- Regulatory inquiries and law enforcement liaison.
- SAR approval and submission.
- Account suspension decisions.

**SLA**: Respond within 1 hour, resolve within 4 hours.

### Level 4: Chief Risk Officer
**Handles**:
- Systemic fraud events affecting multiple customers.
- Regulatory enforcement actions.
- Public disclosure decisions.
- Board-level reporting.

**SLA**: Immediate response, situational resolution.

## 2. Escalation Triggers

### Automatic Escalation to Level 2
- Fraud score exceeds 0.8.
- Transaction amount exceeds $10,000.
- More than 5 alerts for the same customer within 24 hours.
- Suspected account takeover (new device + channel change + high-value transaction).

### Automatic Escalation to Level 3
- Fraud score exceeds 0.95.
- Total flagged amount for a single customer exceeds $50,000 in 7 days.
- Multiple customers flagged for the same merchant within 1 hour.
- SAR filing threshold reached ($5,000+ suspected illegal activity).

### Automatic Escalation to Level 4
- More than 100 customers affected by related fraud pattern.
- Total suspected fraud exceeds $500,000 in 24 hours.
- Media inquiry about fraud at the institution.
- Law enforcement subpoena received.

## 3. Communication Protocol

### Internal Notifications
- Level 1 to Level 2: email + ticketing system.
- Level 2 to Level 3: phone call + email within 30 minutes.
- Level 3 to Level 4: immediate phone call.

### External Notifications
- Customer notification: only after investigation completion, within 5 business days.
- Law enforcement: as required by SAR filing or subpoena.
- Regulatory bodies: within required reporting timelines.

## 4. After-Action Review

Following resolution of any Level 3+ escalation:
- Conduct a post-incident review within 5 business days.
- Document root cause, timeline, and actions taken.
- Identify process improvements.
- Update monitoring rules if applicable.
- Report findings to risk committee.
