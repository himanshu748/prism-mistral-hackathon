import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const DEFAULT_PORT = 3000;
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const DEFAULT_MODEL = 'mistral-small-latest';
const MAX_QUESTION_CHARS = 2000;
const MISTRAL_TIMEOUT_MS = 120000;

app.disable('x-powered-by');
app.use(express.json({ limit: '16kb', strict: true }));
app.use(express.static(join(__dirname, 'public')));

function configuredPort() {
    const parsed = Number.parseInt(process.env.PORT || `${DEFAULT_PORT}`, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

function mistralApiKey() {
    return (process.env.MISTRAL_API_KEY || '').trim();
}

function hasMistralKey() {
    return Boolean(mistralApiKey());
}

function mistralModel() {
    return (process.env.MISTRAL_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

function validateQuestion(question) {
    if (typeof question !== 'string' || !question.trim()) {
        return { ok: false, status: 400, error: 'Question is required' };
    }

    const normalized = question.trim();
    if (normalized.length > MAX_QUESTION_CHARS) {
        return { ok: false, status: 413, error: `Question must be ${MAX_QUESTION_CHARS} characters or fewer.` };
    }

    return { ok: true, question: normalized };
}

function safeClientError(error) {
    const message = error instanceof Error ? error.message : '';

    if (message.includes('MISTRAL_API_KEY') || message.startsWith('Mistral API error')) {
        return message;
    }

    if (error instanceof Error && error.name === 'AbortError') {
        return 'Mistral request timed out. Please try again.';
    }

    return 'Analysis failed. Check server logs for details.';
}

// Settings endpoints
app.get('/api/settings', (req, res) => {
    res.json({
        hasKey: hasMistralKey(),
        model: mistralModel(),
        maxQuestionChars: MAX_QUESTION_CHARS
    });
});

app.post('/api/validate-key', async (req, res) => {
    if (!hasMistralKey()) {
        return res.status(500).json({ valid: false, error: 'MISTRAL_API_KEY is not configured on the server.' });
    }

    try {
        const response = await callMistral({ messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 });
        res.json({ valid: response.ok, error: response.ok ? null : `Mistral returned HTTP ${response.status}.` });
    } catch (e) {
        res.json({ valid: false, error: 'Unable to reach Mistral from the server.' });
    }
});

function requireMistralKey() {
    const key = mistralApiKey();
    if (!key) {
        throw new Error('MISTRAL_API_KEY is not configured on the server.');
    }
    return key;
}

async function callMistral(payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MISTRAL_TIMEOUT_MS);

    try {
        return await fetch(MISTRAL_API_URL, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${requireMistralKey()}`
            },
            body: JSON.stringify({ model: mistralModel(), ...payload })
        });
    } finally {
        clearTimeout(timeout);
    }
}

function providerError(response) {
    return `Mistral API error: HTTP ${response.status}`;
}

// ============================================
// Tool Definitions for Function Calling
// ============================================

const RESEARCHER_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'search_knowledge_base',
            description: 'Search for factual information, statistics, studies, and data about a topic. Returns relevant facts and data points.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The search query to find relevant facts and data' },
                    category: {
                        type: 'string',
                        enum: ['statistics', 'case_studies', 'market_data', 'academic_research', 'news'],
                        description: 'The category of information to search for'
                    }
                },
                required: ['query', 'category']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_expert_opinion',
            description: 'Retrieve expert opinions and quotes from thought leaders on a specific topic.',
            parameters: {
                type: 'object',
                properties: {
                    topic: { type: 'string', description: 'The topic to get expert opinions on' },
                    field: { type: 'string', description: 'The field of expertise (e.g., economics, technology, psychology)' }
                },
                required: ['topic', 'field']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'analyze_trends',
            description: 'Analyze historical trends and patterns related to a topic. Returns trend data and analysis.',
            parameters: {
                type: 'object',
                properties: {
                    topic: { type: 'string', description: 'The topic to analyze trends for' },
                    time_period: { type: 'string', description: 'Time period to analyze (e.g., "last 5 years", "2020-2025")' }
                },
                required: ['topic']
            }
        }
    }
];

// Simulated tool execution (in a real app, these would call external APIs)
function executeToolCall(name, args) {
    const toolResponses = {
        search_knowledge_base: (args) => {
            const data = {
                statistics: `📊 Key Statistics for "${args.query}":\n• Multiple peer-reviewed studies and industry reports provide data on this topic\n• Global market analysis shows significant trends in this area\n• Recent surveys indicate shifting perspectives among key stakeholders\n• Quantitative analysis reveals measurable impact across multiple dimensions`,
                case_studies: `📋 Notable Case Studies for "${args.query}":\n• Several high-profile examples demonstrate both success and failure patterns\n• Industry leaders have documented their experiences and outcomes\n• Longitudinal studies tracking outcomes over 5-10 year periods reveal important patterns\n• Cross-industry comparisons highlight universal vs domain-specific factors`,
                market_data: `📈 Market Data for "${args.query}":\n• Current market valuations and growth trajectories are well-documented\n• Competitive landscape analysis reveals key differentiators\n• Investment patterns show where capital is flowing in this space\n• Regional variations exist across major markets (NA, EU, APAC)`,
                academic_research: `🎓 Academic Research on "${args.query}":\n• Peer-reviewed studies from top institutions provide rigorous analysis\n• Meta-analyses synthesize findings across multiple studies\n• Theoretical frameworks offer explanatory models for observed phenomena\n• Ongoing research continues to refine our understanding`,
                news: `📰 Recent Developments in "${args.query}":\n• Major developments in the past 12 months have shifted the landscape\n• Key industry players have made significant announcements\n• Regulatory changes are creating new dynamics\n• Public discourse is evolving rapidly around this topic`
            };
            return data[args.category] || data.statistics;
        },
        get_expert_opinion: (args) => {
            return `👤 Expert Perspectives on "${args.topic}" (${args.field}):\n• Leading experts emphasize the importance of nuanced, evidence-based approaches\n• There is notable disagreement among experts on key aspects, reflecting genuine complexity\n• Practitioners with hands-on experience often have different views than theorists\n• The consensus is evolving as new evidence emerges`;
        },
        analyze_trends: (args) => {
            return `📉 Trend Analysis for "${args.topic}" (${args.time_period || 'recent years'}):\n• Clear directional trends are visible in the data over this period\n• Cyclical patterns suggest periodic shifts in approach and outcomes\n• Acceleration in certain metrics indicates growing momentum\n• Leading indicators suggest potential future developments`;
        }
    };

    const fn = toolResponses[name];
    return fn ? fn(args) : `Tool ${name} returned relevant data.`;
}

// ============================================
// Agent Personas
// ============================================

const AGENTS = {
    researcher: {
        name: 'Researcher',
        emoji: '🔍',
        color: '#6C63FF',
        systemPrompt: `You are the Researcher agent in a multi-agent decision analysis system called Prism.
Your role is to gather relevant facts, data points, context, and background information about the topic.
You have access to research tools. USE THEM to gather data before writing your analysis.
IMPORTANT: You MUST call at least 2-3 tools to gather data before writing your final analysis.
Be thorough, cite real-world examples and statistics where possible.
Structure your response with clear sections. Use markdown formatting.
Keep your final analysis to 200-300 words, focused and data-driven.
Do NOT give opinions — only facts and context.`
    },
    advocate: {
        name: 'Advocate',
        emoji: '⚖️',
        color: '#00D9FF',
        systemPrompt: `You are the Advocate agent in a multi-agent decision analysis system called Prism.
Your role is to argue IN FAVOR of the proposition/idea presented.
Build the strongest possible case FOR it. Use persuasive reasoning, real examples, and logical arguments.
Structure your response with numbered key arguments.
Keep your analysis to 200-300 words, compelling and well-structured.
Be passionate but logical. Use markdown formatting.`
    },
    critic: {
        name: 'Critic',
        emoji: '🛡️',
        color: '#FF6B6B',
        systemPrompt: `You are the Critic agent in a multi-agent decision analysis system called Prism.
Your role is to argue AGAINST the proposition/idea, find weaknesses, risks, and potential problems.
Play devil's advocate. Identify blind spots, risks, hidden costs, and failure modes.
Structure your response with numbered key counter-arguments.
Keep your analysis to 200-300 words, sharp and analytical.
Be rigorous but fair. Use markdown formatting.`
    },
    synthesizer: {
        name: 'Synthesizer',
        emoji: '🧠',
        color: '#FFD93D',
        systemPrompt: `You are the Synthesizer agent in a multi-agent decision analysis system called Prism.
You receive analysis from agents (Researcher, Advocate, Critic) including their debate rebuttals.
Your job is to:
1. Weigh all perspectives fairly, including the debate arguments
2. Identify the strongest arguments on each side
3. Find common ground and novel insights
4. Deliver a clear, actionable verdict with a confidence score (0-100%)
5. Provide 3 concrete next steps

Structure your response EXACTLY as:
## Verdict
[Your clear recommendation]

## Confidence: [X]%

## Key Insights
[Numbered list of the most important takeaways]

## Recommended Next Steps
[3 actionable steps]

Keep to 250-350 words. Be decisive. Use markdown formatting.`
    }
};

// ============================================
// Health Check
// ============================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        model: mistralModel(),
        hasKey: hasMistralKey(),
        maxQuestionChars: MAX_QUESTION_CHARS
    });
});

// ============================================
// Researcher with Function Calling
// ============================================
async function runResearcherWithTools(question, res) {
    const messages = [
        { role: 'system', content: AGENTS.researcher.systemPrompt },
        { role: 'user', content: `Analyze the following question/topic:\n\n${question}` }
    ];

    // Step 1: Initial call with tools to let the model decide what to search
    const initialResponse = await callMistral({
        messages,
        tools: RESEARCHER_TOOLS,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 1024
    });

    if (!initialResponse.ok) {
        throw new Error(providerError(initialResponse));
    }

    const initialResult = await initialResponse.json();
    const assistantMessage = initialResult.choices[0].message;

    // Check if the model wants to call tools
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        // Add assistant message with tool calls to history
        messages.push(assistantMessage);

        // Execute each tool call and stream the tool calls to the frontend
        for (const toolCall of assistantMessage.tool_calls) {
            const fnName = toolCall.function.name;
            const fnArgs = JSON.parse(toolCall.function.arguments || '{}');

            // Send tool call event to frontend
            res.write(`data: ${JSON.stringify({
                type: 'tool_call',
                agent: 'researcher',
                tool: fnName,
                args: fnArgs
            })}\n\n`);

            // Execute the tool
            const toolResult = executeToolCall(fnName, fnArgs);

            // Send tool result event to frontend
            res.write(`data: ${JSON.stringify({
                type: 'tool_result',
                agent: 'researcher',
                tool: fnName,
                result: toolResult
            })}\n\n`);

            // Add tool result to messages
            messages.push({
                role: 'tool',
                name: fnName,
                content: toolResult,
                tool_call_id: toolCall.id
            });
        }

        // Step 2: Final call with tool results to get the analysis (streamed)
        const finalResponse = await callMistral({
            messages,
            stream: true,
            temperature: 0.7,
            max_tokens: 1024
        });

        if (!finalResponse.ok) {
            throw new Error(providerError(finalResponse));
        }

        return await streamResponse(finalResponse, 'researcher', res);
    } else {
        // No tool calls, just return the content directly
        if (assistantMessage.content) {
            res.write(`data: ${JSON.stringify({
                agent: 'researcher',
                content: assistantMessage.content,
                type: 'chunk'
            })}\n\n`);
            return assistantMessage.content;
        }
    }
}

// ============================================
// Stream Helper (shared for streaming responses)
// ============================================
async function streamResponse(response, agentType, res) {
    let fullContent = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                    fullContent += delta;
                    res.write(`data: ${JSON.stringify({ agent: agentType, content: delta, type: 'chunk' })}\n\n`);
                }
            } catch (e) {
                // Skip malformed chunks
            }
        }
    }

    return fullContent;
}

// ============================================
// Standard Agent Streaming (for non-researcher agents)
// ============================================
async function streamAgent(agentType, question, context, res) {
    const agent = AGENTS[agentType];
    const messages = [
        { role: 'system', content: agent.systemPrompt }
    ];

    if (context) {
        messages.push({
            role: 'user',
            content: `Here is the analysis from previous agents:\n\n${context}\n\nNow, based on this context, provide your analysis for the following question:\n\n${question}`
        });
    } else {
        messages.push({
            role: 'user',
            content: `Analyze the following question/topic:\n\n${question}`
        });
    }

    const response = await callMistral({
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 1024
    });

    if (!response.ok) {
        throw new Error(providerError(response));
    }

    return await streamResponse(response, agentType, res);
}

// ============================================
// Debate Round (Advocate rebuts Critic and vice versa)
// ============================================
async function runDebateRound(question, agentOutputs, res) {
    // Advocate rebuts Critic
    const advocateRebuttalPrompt = `You are the Advocate in a debate. The Critic made these arguments against your position:\n\n${agentOutputs.critic}\n\nWrite a sharp, focused 100-150 word rebuttal defending your original position. Address their strongest points directly. Be persuasive but fair. Use markdown.`;

    // Critic rebuts Advocate
    const criticRebuttalPrompt = `You are the Critic in a debate. The Advocate made these arguments:\n\n${agentOutputs.advocate}\n\nWrite a sharp, focused 100-150 word rebuttal challenging their strongest points. Identify logical flaws, missing evidence, or oversimplifications. Be rigorous but fair. Use markdown.`;

    // Run both rebuttals in parallel
    const [advocateRebuttal, criticRebuttal] = await Promise.all([
        streamDebateAgent('advocate', advocateRebuttalPrompt, res),
        streamDebateAgent('critic', criticRebuttalPrompt, res)
    ]);

    return { advocateRebuttal, criticRebuttal };
}

async function streamDebateAgent(agentType, prompt, res) {
    const agent = AGENTS[agentType];
    const messages = [
        { role: 'system', content: `You are the ${agent.name} agent. Provide a focused debate rebuttal. Use markdown formatting.` },
        { role: 'user', content: prompt }
    ];

    const response = await callMistral({
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 512
    });

    if (!response.ok) {
        throw new Error(providerError(response));
    }

    // Stream with 'debate' prefix to differentiate from initial analysis
    let fullContent = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                    fullContent += delta;
                    res.write(`data: ${JSON.stringify({ agent: agentType, content: delta, type: 'debate_chunk' })}\n\n`);
                }
            } catch (e) { }
        }
    }

    return fullContent;
}

// ============================================
// Generate Graph Data
// ============================================
async function generateGraphData(question, agentOutputs) {
    const messages = [
        {
            role: 'system',
            content: `You are a JSON data generator. Given agent analyses, extract key arguments and their relationships.
Return ONLY valid JSON with this exact structure:
{
  "nodes": [
    { "id": "r1", "label": "short label", "agent": "researcher", "weight": 1-10 },
    { "id": "a1", "label": "short label", "agent": "advocate", "weight": 1-10 },
    { "id": "c1", "label": "short label", "agent": "critic", "weight": 1-10 }
  ],
  "links": [
    { "source": "r1", "target": "a1", "type": "supports" },
    { "source": "c1", "target": "a1", "type": "opposes" }
  ]
}
Generate 4-6 nodes per agent (12-18 total) and 10-15 links. Link types: "supports", "opposes", "relates". Keep labels under 6 words.`
        },
        {
            role: 'user',
            content: `Question: ${question}\n\nResearcher:\n${agentOutputs.researcher}\n\nAdvocate:\n${agentOutputs.advocate}\n\nCritic:\n${agentOutputs.critic}`
        }
    ];

    const response = await callMistral({
        messages,
        temperature: 0.3,
        max_tokens: 2048,
        response_format: { type: 'json_object' }
    });

    if (!response.ok) {
        throw new Error(providerError(response));
    }

    const result = await response.json();
    return JSON.parse(result.choices[0].message.content);
}

// ============================================
// Main Analysis Endpoint
// ============================================
app.post('/api/analyze', async (req, res) => {
    const validation = validateQuestion(req.body?.question);
    if (!validation.ok) {
        return res.status(validation.status).json({ error: validation.error });
    }
    const { question } = validation;

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
        requireMistralKey();
        const agentOutputs = {};

        // Phase 1: Researcher with Function Calling
        res.write(`data: ${JSON.stringify({ type: 'phase', agent: 'researcher', status: 'start' })}\n\n`);
        agentOutputs.researcher = await runResearcherWithTools(question, res);
        res.write(`data: ${JSON.stringify({ type: 'phase', agent: 'researcher', status: 'complete' })}\n\n`);

        // Phase 2: Advocate and Critic (parallel, with researcher context)
        res.write(`data: ${JSON.stringify({ type: 'phase', agent: 'advocate', status: 'start' })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'phase', agent: 'critic', status: 'start' })}\n\n`);

        const researchContext = `**Researcher's Findings:**\n${agentOutputs.researcher}`;
        const [advocateResult, criticResult] = await Promise.all([
            streamAgent('advocate', question, researchContext, res),
            streamAgent('critic', question, researchContext, res)
        ]);

        agentOutputs.advocate = advocateResult;
        agentOutputs.critic = criticResult;
        res.write(`data: ${JSON.stringify({ type: 'phase', agent: 'advocate', status: 'complete' })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'phase', agent: 'critic', status: 'complete' })}\n\n`);

        // Phase 3: DEBATE ROUND — Advocate and Critic rebut each other
        res.write(`data: ${JSON.stringify({ type: 'phase', agent: 'debate', status: 'start' })}\n\n`);
        const debateResults = await runDebateRound(question, agentOutputs, res);
        res.write(`data: ${JSON.stringify({ type: 'phase', agent: 'debate', status: 'complete' })}\n\n`);

        // Phase 4: Generate graph data
        res.write(`data: ${JSON.stringify({ type: 'phase', agent: 'graph', status: 'start' })}\n\n`);
        let graphData;
        try {
            graphData = await generateGraphData(question, agentOutputs);
            res.write(`data: ${JSON.stringify({ type: 'graph', data: graphData })}\n\n`);
        } catch (e) {
            console.error('Graph generation failed:', e);
            res.write(`data: ${JSON.stringify({ type: 'graph', data: { nodes: [], links: [] } })}\n\n`);
        }

        // Phase 5: Synthesizer (gets ALL context including debate)
        res.write(`data: ${JSON.stringify({ type: 'phase', agent: 'synthesizer', status: 'start' })}\n\n`);
        const fullContext = `**Researcher's Findings:**\n${agentOutputs.researcher}\n\n**Advocate's Arguments (FOR):**\n${agentOutputs.advocate}\n\n**Critic's Arguments (AGAINST):**\n${agentOutputs.critic}\n\n**Debate Round - Advocate's Rebuttal:**\n${debateResults.advocateRebuttal}\n\n**Debate Round - Critic's Rebuttal:**\n${debateResults.criticRebuttal}`;
        agentOutputs.synthesizer = await streamAgent('synthesizer', question, fullContext, res);
        res.write(`data: ${JSON.stringify({ type: 'phase', agent: 'synthesizer', status: 'complete' })}\n\n`);

        // Extract confidence score for the gauge
        const confidenceMatch = agentOutputs.synthesizer.match(/Confidence:\s*(\d+)%/i);
        const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 70;
        res.write(`data: ${JSON.stringify({ type: 'confidence', score: confidence })}\n\n`);

        // Done
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();

    } catch (error) {
        const message = safeClientError(error);
        if (message.includes('MISTRAL_API_KEY') || message.startsWith('Mistral API error') || message.includes('timed out')) {
            console.warn(`Analysis stopped: ${message}`);
        } else {
            console.error('Analysis error:', error);
        }
        res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
        res.end();
    }
});

function startServer(port = configuredPort()) {
    return app.listen(port, () => {
        console.log(`\nPrism is running at http://localhost:${port}\n`);
    });
}

if (process.env.NODE_ENV !== 'test') {
    startServer();
}

export {
    app,
    configuredPort,
    hasMistralKey,
    mistralModel,
    safeClientError,
    startServer,
    validateQuestion
};
