# Fraud Investigation Procedure

## 1. Initial Alert Triage

When a transaction is flagged by the automated detection system:

1. **Review the alert details**: transaction amount, merchant, channel, customer profile, and fraud score.
2. **Check the customer's recent transaction history** for the last 30 days.
3. **Assess the alert priority** based on the risk matrix:
   - **Critical (score > 0.9)**: investigate within 1 hour. Temporarily suspend the account.
   - **High (score 0.7-0.9)**: investigate within 4 hours. Place a watch on the account.
   - **Medium (score 0.5-0.7)**: investigate within 24 hours.
   - **Low (score 0.3-0.5)**: batch review within 48 hours.

## 2. Investigation Steps

### 2.1 Transaction Verification
- Compare the flagged transaction against the customer's typical behavior:
  - Usual transaction amounts (mean and standard deviation).
  - Usual merchant categories and channels.
  - Geographic consistency (if available).
- Check for velocity anomalies: multiple transactions in rapid succession.
- Verify if the merchant category is new for this customer.

### 2.2 Pattern Analysis
- Look for classic fraud patterns:
  - **Card testing**: small transactions followed by large ones.
  - **Account takeover**: sudden change in spending pattern, new device or channel.
  - **Bust-out fraud**: gradual increase in credit utilization before large purchases.
- Check if other customers have been flagged for the same merchant.

### 2.3 Customer Contact
- For high-priority alerts, attempt to contact the customer to verify the transaction.
- Document the contact attempt and outcome.
- If the customer confirms the transaction is legitimate, update the alert as a false positive.

## 3. Decision and Resolution

After investigation, classify the alert as:
- **Confirmed Fraud**: block the card, initiate chargeback, file SAR if applicable.
- **Suspicious**: escalate to senior investigator, maintain account watch.
- **False Positive**: close the alert, update the model feedback loop.

## 4. Documentation Requirements

All investigations must be documented with:
- Investigator name and timestamp.
- Evidence reviewed.
- Decision rationale.
- Actions taken.
- Follow-up requirements.
