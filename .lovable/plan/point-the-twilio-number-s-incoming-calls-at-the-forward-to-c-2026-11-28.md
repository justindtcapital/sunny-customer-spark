# Point the Twilio number's incoming calls at the "Forward to Cell" TwiML Bin

Goal: calls to +1 (650) 382-4252 forward to Chris's cell, so Meta's verification call reads out the WhatsApp code.

## Steps
1. Use the saved Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) to look up the number on the account.
2. Set the number's incoming-call address to the "Forward to Cell" TwiML Bin's address, https://handler.twilio.com/twiml/EH86b18dfebbbbbe350c5b1fbe0505e14b (method POST).
3. Read the number back to confirm the change saved.
4. Chris picks "Phone call" in Meta, answers on his cell, and enters the 6-digit code.

## Technical details
- Twilio REST: GET /2010-04-01/Accounts/{SID}/IncomingPhoneNumbers.json?PhoneNumber=+16503824252, then POST .../IncomingPhoneNumbers/{PN sid}.json with VoiceUrl and VoiceMethod=POST.
- TwiML Bins have no public listing API. The new console shows only the bin's ID (the code with the copy button, starting EH); the bin's address is built from it as https://handler.twilio.com/twiml/<bin ID>.
- No app code changes. After verification, voice handling can stay as is; WhatsApp messages go to /api/public/twilio-whatsapp once the sender is registered.
