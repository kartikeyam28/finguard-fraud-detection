# Transaction Monitoring Rules

## 1. Velocity Rules

### 1.1 Rapid Succession
- **Rule**: Flag if more than 3 transactions from the same customer within 10 minutes.
- **Rationale**: Legitimate customers rarely make rapid successive purchases. Card testing and automated fraud generate bursts.
- **Action**: Real-time alert, temporary hold on 4th transaction pending verification.

### 1.2 Daily Volume
- **Rule**: Flag if customer exceeds 15 transactions in a 24-hour period.
- **Rationale**: Abnormal daily volume may indicate compromised credentials or account takeover.
- **Action**: Alert for review within 4 hours.

### 1.3 Hourly Volume
- **Rule**: Flag if customer exceeds 5 transactions in a 1-hour period.
- **Action**: Real-time alert.

## 2. Amount Thresholds

### 2.1 Single Transaction
- **Rule**: Flag any single transaction exceeding $5,000.
- **Enhanced rule**: Flag if transaction exceeds customer's historical average by more than 3 standard deviations.
- **Action**: Alert based on risk score.

### 2.2 Cumulative Daily Amount
- **Rule**: Flag if total daily spend exceeds $10,000.
- **Action**: Review within 2 hours.

### 2.3 Small Transaction Patterns
- **Rule**: Flag sequences of transactions under $1 (potential card testing).
- **Action**: Immediate alert if 3+ sub-dollar transactions in 1 hour.

## 3. Channel and Device Rules

### 3.1 Channel Switching
- **Rule**: Flag if a customer uses a new channel (e.g., first online transaction after only in-store history).
- **Action**: Standard review.

### 3.2 Device Anomaly
- **Rule**: Flag transactions from a new device (mobile/desktop) if the customer typically uses a different device type.
- **Action**: Standard review, may require additional authentication.

## 4. Merchant Category Rules

### 4.1 New Category
- **Rule**: Flag first transaction in a merchant category the customer has never used.
- **Rationale**: Account takeover often involves purchases in categories the legitimate cardholder doesn't frequent (e.g., electronics, luxury goods).
- **Action**: Review based on risk score and amount.

### 4.2 High-Risk Categories
- **High-risk categories**: electronics, jewelry, gift cards, cryptocurrency exchanges, gambling.
- **Rule**: Apply enhanced monitoring for transactions in high-risk categories.
- **Action**: Lower threshold for flagging (score > 0.4 instead of standard 0.5).

## 5. Geographic Rules

### 5.1 Impossible Travel
- **Rule**: Flag if two transactions occur in different geographic locations within a timeframe that makes physical travel impossible.
- **Action**: Immediate alert, account suspension pending verification.

### 5.2 High-Risk Jurisdictions
- **Rule**: Apply enhanced monitoring for transactions originating from or destined to high-risk jurisdictions as defined by the AML compliance policy.
- **Action**: EDD procedures apply.
