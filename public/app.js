/* ============================================
   PRISM — Frontend Application Logic
   ============================================ */

// ---- Particle Background ----
function initParticles() {
    const canvas = document.getElementById('particles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    const PARTICLE_COUNT = 60;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    class Particle {
        constructor() { this.reset(); }
        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.vx = (Math.random() - 0.5) * 0.3;
            this.vy = (Math.random() - 0.5) * 0.3;
            this.radius = Math.random() * 1.5 + 0.5;
            this.opacity = Math.random() * 0.3 + 0.05;
            const colors = ['108,99,255', '0,217,255', '255,217,61', '255,107,107'];
            this.color = colors[Math.floor(Math.random() * colors.length)];
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;
            if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
            if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${this.color}, ${this.opacity})`;
            ctx.fill();
        }
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(new Particle());
    }

    function drawConnections() {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 150) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(108, 99, 255, ${0.06 * (1 - dist / 150)})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => { p.update(); p.draw(); });
        drawConnections();
        requestAnimationFrame(animate);
    }
    animate();
}

// ---- State ----
let isAnalyzing = false;
let agentContents = { researcher: '', advocate: '', critic: '', synthesizer: '' };
let debateContents = { advocate: '', critic: '' };
let toolCallCount = 0;

// ---- DOM Helpers ----
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderMarkdown(markdown) {
    if (!window.marked || !window.DOMPurify) {
        return escapeHtml(markdown).replace(/\n/g, '<br>');
    }

    return DOMPurify.sanitize(marked.parse(markdown || ''));
}

// ---- Set example question ----
function setQuestion(el) {
    $('#questionInput').value = el.textContent;
    $('#questionInput').focus();
}

// ---- Start Analysis ----
async function startAnalysis() {
    const question = $('#questionInput').value.trim();
    if (!question || isAnalyzing) return;
    if (!await ensureServerReady()) return;

    isAnalyzing = true;
    agentContents = { researcher: '', advocate: '', critic: '', synthesizer: '' };
    debateContents = { advocate: '', critic: '' };
    toolCallCount = 0;

    // UI Transitions
    $('#heroSection').style.display = 'none';
    const analysisSection = $('#analysisSection');
    analysisSection.classList.add('active');
    $('#analyzeBtn').disabled = true;
    $('#newQuestion').style.display = 'none';
    $('#graphSection').classList.remove('active');
    $('#graphLoading').classList.remove('hidden');

    // Reset tool calls
    $('#toolCallsSection').classList.remove('active');
    $('#toolCallsList').innerHTML = '';
    $('#toolCount').textContent = '0 calls';

    // Reset debate
    $('#debateSection').classList.remove('active');
    ['advocate', 'critic'].forEach(a => {
        $(`#content-debate-${a}`).innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
        const debateCard = a === 'advocate' ? $('#debateAdvocate') : $('#debateCritic');
        debateCard.classList.remove('active', 'complete');
        const statusEl = $(`#status-debate-${a}`);
        if (statusEl) statusEl.querySelector('span').textContent = 'Waiting';
    });

    // Reset confidence
    $('#confidenceSection').classList.remove('active');
    $('#gaugeArc').style.strokeDashoffset = '534';
    $('#gaugeValue').textContent = '0';

    // Reset agents
    ['researcher', 'advocate', 'critic', 'synthesizer'].forEach(agent => {
        const card = $(`#card-${agent}`);
        card.classList.remove('active', 'complete');
        const content = $(`#content-${agent}`);
        content.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
        const status = $(`#status-${agent}`);
        status.querySelector('span').textContent = 'Waiting';
    });

    $('#progressBar').setAttribute('data-progress', '0');

    // Scroll to analysis
    analysisSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question })
        });

        if (!response.ok || !response.body) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Analysis request failed.');
        }

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

                try {
                    const event = JSON.parse(data);
                    handleSSEEvent(event);
                } catch (e) {
                    // skip
                }
            }
        }
    } catch (error) {
        showError(error.message || 'Analysis failed. Please try again.');
    }

    isAnalyzing = false;
    $('#analyzeBtn').disabled = false;
    $('#newQuestion').style.display = 'block';
}

// ---- Handle SSE Events ----
function handleSSEEvent(event) {
    switch (event.type) {
        case 'phase':
            handlePhaseEvent(event);
            break;
        case 'chunk':
            handleChunkEvent(event);
            break;
        case 'tool_call':
            handleToolCallEvent(event);
            break;
        case 'tool_result':
            handleToolResultEvent(event);
            break;
        case 'debate_chunk':
            handleDebateChunkEvent(event);
            break;
        case 'graph':
            handleGraphEvent(event);
            break;
        case 'confidence':
            handleConfidenceEvent(event);
            break;
        case 'done':
            handleDoneEvent();
            break;
        case 'error':
            showError(event.message);
            break;
    }
}

function handlePhaseEvent(event) {
    const { agent, status } = event;

    // Handle debate phase
    if (agent === 'debate') {
        if (status === 'start') {
            $('#debateSection').classList.add('active');
            $('#debateAdvocate').classList.add('active');
            $('#debateCritic').classList.add('active');
            $(`#status-debate-advocate`).querySelector('span').textContent = 'Debating...';
            $(`#status-debate-critic`).querySelector('span').textContent = 'Debating...';
            $('#debateSection').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        if (status === 'complete') {
            $('#debateAdvocate').classList.remove('active');
            $('#debateAdvocate').classList.add('complete');
            $('#debateCritic').classList.remove('active');
            $('#debateCritic').classList.add('complete');
            $(`#status-debate-advocate`).querySelector('span').textContent = 'Complete';
            $(`#status-debate-critic`).querySelector('span').textContent = 'Complete';

            // Render final debate content
            const advContent = $(`#content-debate-advocate`);
            if (debateContents.advocate) {
                advContent.innerHTML = `<div class="markdown-body">${renderMarkdown(debateContents.advocate)}</div>`;
            }
            const critContent = $(`#content-debate-critic`);
            if (debateContents.critic) {
                critContent.innerHTML = `<div class="markdown-body">${renderMarkdown(debateContents.critic)}</div>`;
            }
        }
        return;
    }

    // Handle graph phase (skip card handling)
    if (agent === 'graph') return;

    const card = $(`#card-${agent}`);
    const statusEl = $(`#status-${agent}`);
    const stageEl = $(`#stage-${agent}`);

    if (status === 'start') {
        if (card) {
            card.classList.add('active');
            card.classList.remove('complete');
        }
        if (statusEl) statusEl.querySelector('span').textContent = 'Analyzing...';
        if (stageEl) stageEl.classList.add('active');

        // Update progress
        const progressMap = { researcher: '25', advocate: '50', critic: '50', synthesizer: '75' };
        if (progressMap[agent]) {
            $('#progressBar').setAttribute('data-progress', progressMap[agent]);
        }

        // Scroll card into view
        if (card) {
            setTimeout(() => {
                card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 200);
        }
    }

    if (status === 'complete') {
        if (card) {
            card.classList.remove('active');
            card.classList.add('complete');
        }
        if (statusEl) statusEl.querySelector('span').textContent = 'Complete';
        if (stageEl) {
            stageEl.classList.remove('active');
            stageEl.classList.add('complete');
        }

        // Render final markdown
        const contentEl = $(`#content-${agent}`);
        if (contentEl && agentContents[agent]) {
            contentEl.innerHTML = `<div class="markdown-body">${renderMarkdown(agentContents[agent])}</div>`;
        }
    }
}

function handleChunkEvent(event) {
    const { agent, content } = event;
    agentContents[agent] = (agentContents[agent] || '') + content;

    const contentEl = $(`#content-${agent}`);
    if (contentEl) {
        const html = renderMarkdown(agentContents[agent]);
        contentEl.innerHTML = `<div class="markdown-body streaming-cursor">${html}</div>`;
        contentEl.scrollTop = contentEl.scrollHeight;
    }
}

// ---- Tool Call Handling ----
function handleToolCallEvent(event) {
    toolCallCount++;
    $('#toolCallsSection').classList.add('active');
    $('#toolCount').textContent = `${toolCallCount} call${toolCallCount > 1 ? 's' : ''}`;

    const iconMap = {
        search_knowledge_base: '🔎',
        get_expert_opinion: '👤',
        analyze_trends: '📈'
    };

    const card = document.createElement('div');
    card.className = 'tool-call-card loading';
    card.id = `tool-${event.tool}-${toolCallCount}`;
    card.innerHTML = `
        <div class="tool-call-header">
            <div class="tool-call-icon">${escapeHtml(iconMap[event.tool] || '⚡')}</div>
            <span class="tool-call-name">${escapeHtml(event.tool)}()</span>
            <span class="tool-call-args">${escapeHtml(Object.values(event.args || {}).join(', '))}</span>
        </div>
        <div class="tool-call-result">Executing...</div>
    `;

    $('#toolCallsList').appendChild(card);
    $('#toolCallsSection').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function handleToolResultEvent(event) {
    // Find the matching tool call card and update it
    const cards = $$('.tool-call-card.loading');
    const card = cards[cards.length - 1]; // Update the most recent loading card
    if (card) {
        card.classList.remove('loading');
        const resultEl = card.querySelector('.tool-call-result');
        if (resultEl) resultEl.textContent = event.result;
    }
}

// ---- Debate Handling ----
function handleDebateChunkEvent(event) {
    const { agent, content } = event;
    debateContents[agent] = (debateContents[agent] || '') + content;

    const contentEl = $(`#content-debate-${agent}`);
    if (contentEl) {
        const html = renderMarkdown(debateContents[agent]);
        contentEl.innerHTML = `<div class="markdown-body streaming-cursor">${html}</div>`;
        contentEl.scrollTop = contentEl.scrollHeight;
    }
}

// ---- Confidence Gauge ----
function handleConfidenceEvent(event) {
    const score = event.score;
    $('#confidenceSection').classList.add('active');

    // Animate the gauge arc (circumference = 2 * PI * 85 ≈ 534)
    const circumference = 534;
    const offset = circumference - (circumference * score / 100);

    const arc = $('#gaugeArc');
    arc.style.transition = 'stroke-dashoffset 2s cubic-bezier(0.4, 0, 0.2, 1)';
    setTimeout(() => {
        arc.style.strokeDashoffset = offset;
    }, 100);

    // Animate number counter
    const valueEl = $('#gaugeValue');
    let current = 0;
    const duration = 2000;
    const startTime = performance.now();

    function animateCounter(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        current = Math.round(eased * score);
        valueEl.textContent = current;
        if (progress < 1) requestAnimationFrame(animateCounter);
    }
    requestAnimationFrame(animateCounter);

    // Scroll gauge into view
    setTimeout(() => {
        $('#confidenceSection').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 300);
}

function handleGraphEvent(event) {
    const graphData = event.data;
    $('#graphLoading').classList.add('hidden');
    $('#graphSection').classList.add('active');
    renderGraph(graphData);
}

function handleDoneEvent() {
    $('#progressBar').setAttribute('data-progress', '100');
    $$('.streaming-cursor').forEach(el => el.classList.remove('streaming-cursor'));
}

function showError(message) {
    const existing = document.querySelector('.error-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'error-toast';
    toast.textContent = message;
    toast.onclick = () => toast.remove();
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);

    if (message.includes('401') || message.includes('Unauthorized') || message.includes('API')) {
        openSettings();
    }
}

// ---- D3.js Argument Graph ----
function renderGraph(data) {
    if (!data || !data.nodes || data.nodes.length === 0) {
        $('#graphContainer').innerHTML = '<div class="graph-loading"><span>No graph data available</span></div>';
        return;
    }

    const container = document.getElementById('graphContainer');
    const width = container.clientWidth;
    const height = container.clientHeight;

    d3.select('#graphSvg').selectAll('*').remove();

    const svg = d3.select('#graphSvg')
        .attr('viewBox', [0, 0, width, height]);

    let tooltip = container.querySelector('.graph-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.className = 'graph-tooltip';
        container.appendChild(tooltip);
    }

    const agentColors = {
        researcher: '#6C63FF',
        advocate: '#00D9FF',
        critic: '#FF6B6B',
        synthesizer: '#FFD93D'
    };

    const linkColors = {
        supports: '#4ADE80',
        opposes: '#FF6B6B',
        relates: '#888'
    };

    const nodeIds = new Set(data.nodes.map(n => n.id));
    const validLinks = data.links.filter(l => nodeIds.has(l.source) && nodeIds.has(l.target));

    const simulation = d3.forceSimulation(data.nodes)
        .force('link', d3.forceLink(validLinks).id(d => d.id).distance(100))
        .force('charge', d3.forceManyBody().strength(-200))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(35));

    const link = svg.append('g')
        .selectAll('line')
        .data(validLinks)
        .join('line')
        .attr('class', 'link')
        .attr('stroke', d => linkColors[d.type] || '#888')
        .attr('stroke-width', d => d.type === 'opposes' ? 2 : 1.5)
        .attr('stroke-dasharray', d => d.type === 'opposes' ? '6,3' : 'none');

    const node = svg.append('g')
        .selectAll('g')
        .data(data.nodes)
        .join('g')
        .attr('class', 'node')
        .call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended));

    node.append('circle')
        .attr('r', d => 8 + (d.weight || 5) * 1.5)
        .attr('fill', d => agentColors[d.agent] || '#888')
        .attr('fill-opacity', 0.2)
        .attr('stroke', d => agentColors[d.agent] || '#888')
        .attr('stroke-width', 2)
        .on('mouseover', function (event, d) {
            d3.select(this).attr('fill-opacity', 0.5);
            tooltip.textContent = d.label;
            tooltip.classList.add('visible');
            tooltip.style.left = (event.offsetX + 15) + 'px';
            tooltip.style.top = (event.offsetY - 10) + 'px';
        })
        .on('mouseout', function () {
            d3.select(this).attr('fill-opacity', 0.2);
            tooltip.classList.remove('visible');
        });

    node.append('text')
        .text(d => d.label.length > 20 ? d.label.slice(0, 18) + '…' : d.label)
        .attr('dy', d => -(12 + (d.weight || 5) * 1.5))
        .attr('text-anchor', 'middle')
        .attr('fill', '#a0a0b8')
        .attr('font-size', '11px');

    node.append('circle')
        .attr('r', 3)
        .attr('fill', d => agentColors[d.agent] || '#888');

    simulation.on('tick', () => {
        link
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);

        node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    node.style('opacity', 0)
        .transition()
        .delay((d, i) => i * 50)
        .duration(500)
        .style('opacity', 1);

    link.style('opacity', 0)
        .transition()
        .delay(300)
        .duration(500)
        .style('opacity', 1);

    function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }

    function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }

    function dragended(event) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
    }
}

// ---- Reset Analysis ----
function resetAnalysis() {
    $('#heroSection').style.display = 'block';
    $('#analysisSection').classList.remove('active');
    $('#questionInput').value = '';
    $('#questionInput').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function ensureServerReady() {
    try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (data.hasKey) return true;
        showError('MISTRAL_API_KEY is not configured on the server.');
    } catch (e) {
        showError('Unable to reach the Prism server.');
    }
    return false;
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
    initParticles();

    // Enter key to submit
    $('#questionInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            startAnalysis();
        }
    });

    // Check server-side provider key status on load.
    checkServerKeyStatus();
});

// ---- Settings Modal ----
function toggleSettings() {
    const modal = $('#settingsModal');
    setSettingsOpen(!modal.classList.contains('active'));
}

function openSettings() {
    setSettingsOpen(true);
}

function setSettingsOpen(open) {
    const modal = $('#settingsModal');
    modal.classList.toggle('active', open);
    if (open) {
        $('#validateBtn').focus();
    }
}

function toggleKeyVisibility() {
    // Keys are configured server-side only.
}

async function validateServerKey() {
    const statusEl = $('#keyStatus');
    const validateBtn = $('#validateBtn');

    validateBtn.disabled = true;
    statusEl.className = 'key-status loading';
    statusEl.textContent = 'Checking server key...';

    try {
        const res = await fetch('/api/validate-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await res.json();

        if (result.valid) {
            statusEl.className = 'key-status success';
            statusEl.textContent = '✓ Server key is configured and reachable.';
            setTimeout(() => toggleSettings(), 1500);
        } else {
            statusEl.className = 'key-status error';
            statusEl.textContent = `✗ ${result.error || 'Server key check failed.'}`;
        }
    } catch (e) {
        statusEl.className = 'key-status error';
        statusEl.textContent = '✗ Connection error while checking the server key.';
    }

    validateBtn.disabled = false;
}

async function checkServerKeyStatus() {
    try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        const statusEl = $('#keyStatus');
        statusEl.className = data.hasKey ? 'key-status success' : 'key-status error';
        statusEl.textContent = data.hasKey
            ? `Server key configured for ${data.model}.`
            : 'MISTRAL_API_KEY is not configured on the server.';
    } catch (e) {
        // ignore
    }
}
