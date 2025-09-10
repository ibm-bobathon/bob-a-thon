import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import dotenv from "dotenv";
dotenv.config();

const LLM_MODEL = "gpt-5-nano"; // Using a more reliable model

const model = new ChatOpenAI({
    model: LLM_MODEL
});

const agent = createReactAgent({
    llm: model,
    tools: [],
    initialMessages: [
        {
            role: "system",
            content: `You are an expert code reviewer that analyzes pull requests for errors, bugs, security issues, and code quality problems.

Your task is to:
1. Analyze the provided PR content (added, modified, and removed files)
2. Look for potential errors, bugs, security vulnerabilities, and code quality issues
3. Generate specific, actionable comments for problematic lines
4. Focus on: syntax errors, logic bugs, security vulnerabilities, performance issues, best practices violations

CRITICAL: You MUST return ONLY a valid JSON array with this EXACT format:

[
  {
    "path": "relative/file/path.js",
    "line": 1,
    "body": "🐛 **Error**: Detailed explanation of the issue and suggested fix"
  }
]

REQUIREMENTS:
- "path" must be the exact file path from the PR
- "line" must be a positive integer (1 or greater) 
- "body" must contain the complete comment with emoji prefix
- Use these emoji prefixes: 🐛 bugs/errors, ⚠️ warnings, 🔒 security, ⚡ performance, 📝 style
- If you can't determine a specific line number, use line 1
- Return empty array [] if no issues found
- DO NOT include any text outside the JSON array
- DO NOT use any other JSON structure or property names`
        }
    ]
});

export async function reviewPullRequest(summaryContent) {
    try {
        // Create a comprehensive prompt with all the PR data
        const prompt = `Please analyze this pull request for errors and issues:

## PR Information
- **Number**: #${summaryContent.prInfo.number}
- **Title**: ${summaryContent.prInfo.title}
- **Files Changed**: ${summaryContent.summary.totalFiles} (${summaryContent.summary.addedFiles} added, ${summaryContent.summary.modifiedFiles} modified, ${summaryContent.summary.removedFiles} removed)

## Added Files
${Object.entries(summaryContent.files.added).map(([filename, data]) => `
### ${filename}
\`\`\`
${data.content}
\`\`\`
`).join('\n')}

## Modified Files  
${Object.entries(summaryContent.files.modified).map(([filename, data]) => `
### ${filename}

**Before:**
\`\`\`
${data.beforeContent || 'File content not available'}
\`\`\`

**After:**
\`\`\`
${data.afterContent || 'File content not available'}
\`\`\`

**Diff:**
\`\`\`diff
${data.diff || 'No diff available'}
\`\`\`
`).join('\n')}

## Removed Files
${Object.entries(summaryContent.files.removed).map(([filename, data]) => `
### ${filename}
\`\`\`
${data.content}
\`\`\`
`).join('\n')}

## Complete Unified Diff
\`\`\`diff
${summaryContent.diffs.unified}
\`\`\`

Please analyze all this content and return a JSON array of specific comments for any issues you find.`;

        const response = await agent.invoke({
            messages: [{ role: "user", content: prompt }]
        });
        
        // Extract the JSON from the response
        const responseText = response.messages[response.messages.length - 1].content;
        
        // Try to extract JSON from the response
        let comments = [];
        try {
            // Look for JSON array in the response
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const rawComments = JSON.parse(jsonMatch[0]);
                
                // Transform comments to the expected format and filter out invalid ones
                comments = rawComments
                    .map(comment => {
                        // Handle different response formats from the AI
                        let path, line, body;
                        
                        if (comment.path && comment.line && comment.body) {
                            // Correct format already
                            return comment;
                        } else if (comment.file || comment.path) {
                            // Transform from alternate format
                            path = comment.file || comment.path;
                            line = comment.line || 1; // Default to line 1 if not specified
                            
                            // Construct body from available fields
                            const severity = comment.severity || comment.issue_type || 'info';
                            const issue = comment.issue || comment.message || 'Issue detected';
                            const suggestion = comment.suggestion || '';
                            
                            // Choose appropriate emoji based on severity
                            let emoji = '📝';
                            if (severity.includes('error') || severity.includes('bug')) emoji = '🐛';
                            else if (severity.includes('warning') || severity.includes('medium')) emoji = '⚠️';
                            else if (severity.includes('security')) emoji = '🔒';
                            else if (severity.includes('performance')) emoji = '⚡';
                            
                            body = `${emoji} **${severity.toUpperCase()}**: ${issue}`;
                            if (suggestion) {
                                body += `\n\n💡 **Suggestion**: ${suggestion}`;
                            }
                            
                            return { path, line, body };
                        }
                        return null;
                    })
                    .filter(comment => comment && comment.path && comment.line && comment.body);
                    
            } else {
                console.warn("No JSON array found in agent response:", responseText);
            }
        } catch (parseError) {
            console.error("Failed to parse agent response as JSON:", parseError.message);
            console.log("Raw response:", responseText);
        }

        return {
            success: true,
            comments: comments || [],
            rawResponse: responseText
        };
        
    } catch (error) {
        console.error("Error in reviewPullRequest:", error.message);
        return {
            success: false,
            error: error.message,
            comments: []
        };
    }
}

export default agent;