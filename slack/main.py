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

@app.message(".*")
def handle_all_messages(message, say):
    """Handle all messages (catch-all)"""
    user = message['user']
    text = message['text']
    logging.info(f"Received message from {user}: {text}")
    say(f"I received your message: '{text}'. Thanks for testing! 🤖")

if __name__ == "__main__":
    app.start(3000)  # POST http://localhost:3000/slack/events

