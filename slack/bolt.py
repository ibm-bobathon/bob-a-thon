import logging
logging.basicConfig(level=logging.DEBUG)

from slack_bolt import App

# export SLACK_SIGNING_SECRET=***
# export SLACK_BOT_TOKEN=xoxb-***
app = App()

# Add functionality here
@app.message("hello")
def handle_hello_message(message, say):
    """Handle messages containing 'hello'"""
    say(f"Hey there <@{message['user']}>! 👋")

@app.message("options")
def send_options_message(message, say):
    """Send a message with two clickable button options"""
    say(
        text="Choose an option:",
        blocks=[
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "Please select one of the following options:"
                }
            },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "Option A"
                        },
                        "value": "option_a",
                        "action_id": "option_a_clicked"
                    },
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "Option B"
                        },
                        "value": "option_b",
                        "action_id": "option_b_clicked"
                    }
                ]
            }
        ]
    )

@app.action("option_a_clicked")
def handle_option_a(ack, body, respond):
    """Handle Option A button click"""
    ack()
    user = body["user"]["id"]
    # Update the original message to remove buttons and show selection
    respond(
        text=f"<@{user}> selected Option A! 🅰️",
        blocks=[
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"<@{user}> selected Option A! 🅰️"
                }
            }
        ],
        replace_original=True
    )

@app.action("option_b_clicked")
def handle_option_b(ack, body, respond):
    """Handle Option B button click"""
    ack()
    user = body["user"]["id"]
    # Update the original message to remove buttons and show selection
    respond(
        text=f"<@{user}> selected Option B! 🅱️",
        blocks=[
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"<@{user}> selected Option B! 🅱️"
                }
            }
        ],
        replace_original=True
    )

# @app.message(".*")
# def handle_all_messages(message, say):
#     """Handle all messages (catch-all)"""
#     user = message['user']
#     text = message['text']
#     logging.info(f"Received message from {user}: {text}")
#     say(f"I received your message: '{text}'. Thanks for testing! 🤖")

if __name__ == "__main__":
    app.start(3000)  # POST http://localhost:3000/slack/events

