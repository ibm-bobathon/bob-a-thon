import os
import json
from flask import Flask, request, jsonify
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

app = Flask(__name__)

slack_client = WebClient(token=os.environ.get("SLACK_BOT_TOKEN"))

@app.route('/failed_workflow', methods=['POST'])
def failed_workflow():
    try:
        json_data = request.get_json()
        if not json_data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        formatted_json = json.dumps(json_data, indent=2)
        message_text = f"= *Workflow Failed*\n```\n{formatted_json}\n```"
        
        response = slack_client.chat_postMessage(
            channel="C09EFA8TM8V",
            text=message_text,
            mrkdwn=True
        )
        
        return jsonify({"success": True, "message": "Failure notification sent"}), 200
        
    except SlackApiError as e:
        return jsonify({"error": f"Slack API error: {e.response['error']}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)