(function () {
    'use strict';

    /* =============================================
       CONFIG & ENDPOINTS
       ============================================= */
    const API_BASE = `${window.location.origin}/api`;
    const REFRESH_MS = 5 * 60 * 1000; // 5 min auto-refresh
    const PER_PAGE = 16;

    /* =============================================
       REALTIME TICKER DATA
       ============================================= */
    const MARKET_DATA = [
        { name: 'EUR/USD',   price: 1.0842,  change: 0.12,  type: 'forex',       digits: 4 },
        { name: 'GBP/USD',   price: 1.2718,  change: -0.05, type: 'forex',       digits: 4 },
        { name: 'USD/JPY',   price: 156.42,  change: 0.31,  type: 'forex',       digits: 2 },
        { name: 'AUD/USD',   price: 0.6651,  change: 0.08,  type: 'forex',       digits: 4 },
        { name: 'Gold (XAU)',price: 2335.80, change: 0.74,  type: 'commodity',   digits: 2 },
        { name: 'Brent Oil', price: 82.45,   change: -1.15, type: 'commodity',   digits: 2 },
        { name: 'S&P 500',   price: 5432.80, change: 0.25,  type: 'index',       digits: 1 },
        { name: 'Nasdaq',    price: 19659.1, change: 0.54,  type: 'index',       digits: 1 },
        { name: 'BTC/USD',   price: 66420.0, change: -0.82, type: 'crypto',      digits: 0 }
    ];

    /* =============================================
       STATE
       ============================================= */
    let articles        = [];
    let filtered        = [];
    let activeCategory  = 'all';
    let activeSource    = 'all';
    let query           = '';
    let shown           = PER_PAGE;
    let isFetching      = false;

    /* =============================================
       DOM REFS
       ============================================= */
    const $ = id => document.getElementById(id);

    const dom = {
        newsGrid    : $('newsGrid'),
        tickerWrap  : $('tickerWrapper'),
        nav         : $('mainNav'),
        search      : $('searchInput'),
        sourceBar   : $('sourceBar'),
        sourcePills : $('sourcePills'),
        loadWrap    : $('loadMoreWrap'),
        loadBtn     : $('loadMoreBtn'),
        lastUpdated : $('lastUpdated'),
        footerSrc   : $('footerSources'),
        dateEl      : $('currentDate'),
        refreshBtn  : $('refreshBtn'),
        errorBanner : $('errorBanner'),
        errorText   : $('errorText'),
        errorRetry  : $('errorRetry'),
        
        // Sentiment UI
        gaugeNeedle   : $('gaugeNeedle'),
        gaugeLabel    : $('gaugeLabel'),
        bullPct       : $('bullPct'),
        bearPct       : $('bearPct'),
        bullFill      : $('bullFill'),
        analyzedCount : $('analyzedCount'),
        alertsBody    : $('breakingAlertsBody'),

        // AI Stats UI
        modelAlgo     : $('modelAlgo'),
        modelFeedbacks: $('modelFeedbacks'),
        modelFeatures : $('modelFeatures'),
        distBull      : $('distBull'),
        distNeutral   : $('distNeutral'),
        distBear      : $('distBear'),
        lblBullCount  : $('lblBullCount'),
        lblNeuCount   : $('lblNeuCount'),
        lblBearCount  : $('lblBearCount')
    };

    /* =============================================
       UTILITIES
       ============================================= */
    function timeAgo(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d)) return '';
        const s = Math.floor((Date.now() - d) / 1000);
        if (s < 60)    return 'Baru saja';
        if (s < 3600)  return Math.floor(s / 60) + ' menit lalu';
        if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
        if (s < 172800) return 'Kemarin';
        return d.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' });
    }

    function formatFullDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d)) return '';
        return d.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    function escHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function fmtDate() {
        return new Date().toLocaleDateString('id-ID', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    }

    /* =============================================
       REALTIME MARKET RATE SIMULATOR
       ============================================= */
    function initTicker() {
        renderTicker();
        setInterval(() => {
            MARKET_DATA.forEach(asset => {
                const percent = (Math.random() * 0.1 - 0.05) / 100;
                asset.price += asset.price * percent;
                asset.change += percent * 100;
            });
            renderTicker();
        }, 3000);
    }

    function renderTicker() {
        const items = [...MARKET_DATA, ...MARKET_DATA, ...MARKET_DATA];
        dom.tickerWrap.innerHTML = items.map(asset => {
            const changeSign = asset.change >= 0 ? '+' : '';
            const changeClass = asset.change >= 0 ? 'up' : 'down';
            return `
                <div class="ticker-item">
                    <span class="ticker-name">${asset.name}</span>
                    <span class="ticker-price">${asset.price.toFixed(asset.digits)}</span>
                    <span class="ticker-change ${changeClass}">${changeSign}${asset.change.toFixed(2)}%</span>
                </div>
            `;
        }).join('');
    }

    /* =============================================
       RENDERING
       ============================================= */

    // --- Market Sentiment Widget ---
    function updateSentimentWidget(list) {
        if (!list.length) {
            dom.gaugeLabel.textContent = 'TIDAK ADA DATA';
            dom.bullPct.textContent = '0%';
            dom.bearPct.textContent = '0%';
            dom.bullFill.style.width = '50%';
            dom.analyzedCount.textContent = '0';
            dom.gaugeNeedle.style.transform = `rotate(0deg)`;
            return;
        }

        const bullCount = list.filter(a => a.sentiment === 'bullish').length;
        const bearCount = list.filter(a => a.sentiment === 'bearish').length;
        const total = bullCount + bearCount;

        let bullPercent = 50;
        let bearPercent = 50;

        if (total > 0) {
            bullPercent = Math.round((bullCount / total) * 100);
            bearPercent = 100 - bullPercent;
        }

        dom.bullPct.textContent = `${bullPercent}%`;
        dom.bearPct.textContent = `${bearPercent}%`;
        dom.bullFill.style.width = `${bullPercent}%`;
        dom.analyzedCount.textContent = list.length;

        // Rotation range: -90deg (Extreme Bearish) to 90deg (Extreme Bullish)
        const rotation = ((bullPercent / 100) * 180) - 90;
        dom.gaugeNeedle.style.transform = `rotate(${rotation}deg)`;

        if (bullPercent >= 75) {
            dom.gaugeLabel.textContent = 'SANGAT OPTIMIS';
            dom.gaugeLabel.style.color = 'var(--green)';
        } else if (bullPercent >= 58) {
            dom.gaugeLabel.textContent = 'OPTIMIS (BULLISH)';
            dom.gaugeLabel.style.color = 'var(--green)';
        } else if (bullPercent <= 25) {
            dom.gaugeLabel.textContent = 'SANGAT PESIMIS';
            dom.gaugeLabel.style.color = 'var(--red)';
        } else if (bullPercent <= 42) {
            dom.gaugeLabel.textContent = 'PESIMIS (BEARISH)';
            dom.gaugeLabel.style.color = 'var(--red)';
        } else {
            dom.gaugeLabel.textContent = 'NETRAL';
            dom.gaugeLabel.style.color = 'var(--gold)';
        }
    }

    // --- Market Alerts Feed ---
    function renderAlerts(list) {
        const keyEvents = list.slice(0, 10);
        
        if (!keyEvents.length) {
            dom.alertsBody.innerHTML = '<div class="ticker-alert-item">Tidak ada alarm di segmen ini</div>';
            return;
        }

        dom.alertsBody.innerHTML = keyEvents.map(a => `
            <div class="ticker-alert-item ${a.sentiment}">
                <strong>${escHtml(a.source)}:</strong> ${escHtml(a.title)}
                <span class="alert-time">${timeAgo(a.pubDate)}</span>
            </div>
        `).join('');
    }

    // --- News Cards Grid ---
    function renderGrid(list) {
        if (!list.length) {
            dom.newsGrid.innerHTML = `<div class="no-results">
                <div class="no-results-icon">🔍</div>
                <div class="no-results-text">Tidak ada berita ditemukan di segmen ini</div>
                <div class="no-results-sub">Coba kategori lain atau kata kunci pencarian yang berbeda</div>
            </div>`;
            dom.loadWrap.style.display = 'none';
            return;
        }

        const fallbackMap = {
            forex: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=600&q=80',
            stocks: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&w=600&q=80',
            macro: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&w=600&q=80',
            commodities: 'https://images.unsplash.com/photo-1618042164219-62c820f10723?auto=format&fit=crop&w=600&q=80',
            all: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=600&q=80'
        };

        const visible = list.slice(0, shown);

        const sentimentMap = {
            bullish: 'BULLISH',
            bearish: 'BEARISH',
            neutral: 'NETRAL'
        };

        dom.newsGrid.innerHTML = visible.map((a, i) => {
            const sTagText = sentimentMap[a.sentiment] || a.sentiment.toUpperCase();
            const sTag = a.sentiment !== 'neutral' ? `<span class="s-tag ${a.sentiment}">${sTagText}</span>` : '';
            
            // Build triggers list
            const triggerHtml = a.triggers.length > 0 
                ? a.triggers.map(t => `<span class="trigger-word">${escHtml(t)}</span>`).join('')
                : '<span class="trigger-word" style="color:var(--text-muted)">Tidak ada</span>';

            // Clean combined text to send to feedback endpoint
            const combinedText = `${a.title} ${a.desc}`.replace(/"/g, '&quot;');
            
            const catKey = a.cats && a.cats.length ? a.cats[0] : 'all';
            const imgUrl = a.image || fallbackMap[catKey] || fallbackMap.all;

            return `
                <div class="news-card" style="--delay: ${Math.min(i * 0.03, 0.4)}s">
                    <div class="card-img-wrap">
                        <img class="card-img" src="${escHtml(imgUrl)}" alt="" loading="lazy"
                             onerror="this.src='${fallbackMap.all}'">
                    </div>
                    <div class="card-source-tag">${escHtml(a.source)}</div>
                    <a href="${escHtml(a.link)}" target="_blank" rel="noopener noreferrer">
                        <h3 class="card-title">${escHtml(a.title)}</h3>
                    </a>
                    ${a.desc ? `<p class="card-desc">${escHtml(a.desc)}</p>` : ''}
                    
                    <!-- AI Explainability details -->
                    <div class="card-ai-details">
                        <div class="ai-confidence">
                            <span class="trigger-label">Keputusan AI</span>
                            <span class="confidence-val ${a.sentiment}">
                                ${a.confidence}% ${sTagText}
                            </span>
                        </div>
                        <div class="ai-triggers">
                            <span class="trigger-label">Pemicu:</span>
                            ${triggerHtml}
                        </div>
                    </div>

                    <!-- Interactive Feedback Panel -->
                    <div class="feedback-panel">
                        <span class="feedback-title">Koreksi Sentimen AI?</span>
                        <div class="feedback-actions">
                            <button class="correct-btn bull" onclick="sendAIFeedback('${combinedText}', 'bullish', this)">Naik</button>
                            <button class="correct-btn neu" onclick="sendAIFeedback('${combinedText}', 'neutral', this)">Netral</button>
                            <button class="correct-btn bear" onclick="sendAIFeedback('${combinedText}', 'bearish', this)">Turun</button>
                        </div>
                    </div>

                    <div class="card-meta">
                        <a href="${escHtml(a.link)}" target="_blank" rel="noopener noreferrer" class="card-source-link" title="Open source article">
                            🔗 ${escHtml(a.source)}
                        </a> 
                        <span>${timeAgo(a.pubDate)} (${formatFullDate(a.pubDate)}) ${sTag}</span>
                    </div>
                </div>
            `;
        }).join('');

        dom.loadWrap.style.display = shown < list.length ? '' : 'none';
    }

    // --- Source Pills ---
    function renderSources() {
        const names = [...new Set(articles.map(a => a.source))].sort();
        dom.sourcePills.innerHTML =
            `<button class="source-pill ${activeSource === 'all' ? 'active' : ''}" data-src="all">Semua Sumber</button>` +
            names.map(n =>
                `<button class="source-pill ${activeSource === n ? 'active' : ''}" data-src="${escHtml(n)}">${escHtml(n)}</button>`
            ).join('');
        dom.sourceBar.style.display = '';
    }

    // --- Footer sources list ---
    function renderFooter(names) {
        dom.footerSrc.innerHTML = names.map(n => `<li>${escHtml(n)}</li>`).join('');
    }

    /* =============================================
       AI FEEDBACK SUBMISSION
       ============================================= */
    window.sendAIFeedback = async function(text, label, btnElement) {
        // Visual button confirmation
        const parent = btnElement.parentElement;
        const btns = parent.querySelectorAll('.correct-btn');
        btns.forEach(b => b.disabled = true);
        btnElement.style.background = 'var(--blue-link)';
        btnElement.style.color = '#fff';

        try {
            const res = await fetch(`${API_BASE}/feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, label })
            });
            const data = await res.json();
            
            if (data.status === 'success') {
                // Instantly refresh model stats
                await loadModelStats();
                // Flash green outline
                btnElement.style.borderColor = 'var(--green)';
                setTimeout(() => {
                    // Re-evaluate news lists with new model weights
                    refreshNewsQuietly();
                }, 800);
            }
        } catch (err) {
            console.error('Failed to submit AI feedback:', err);
            btns.forEach(b => b.disabled = false);
        }
    };

    /* =============================================
       FILTERING
       ============================================= */
    function applyFilters() {
        filtered = articles.filter(a => {
            if (activeCategory !== 'all' && !a.cats.includes(activeCategory)) return false;
            if (activeSource !== 'all' && a.source !== activeSource) return false;
            if (query) {
                const q = query.toLowerCase();
                if (!a.title.toLowerCase().includes(q) && !a.desc.toLowerCase().includes(q)) return false;
            }
            return true;
        });

        updateSentimentWidget(filtered);
        renderAlerts(filtered);
        renderGrid(filtered);
    }

    /* =============================================
       EVENTS
       ============================================= */
    function bindEvents() {
        // Category nav
        dom.nav.addEventListener('click', e => {
            const link = e.target.closest('.nav-link');
            if (!link) return;
            e.preventDefault();
            dom.nav.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            activeCategory = link.dataset.category;
            shown = PER_PAGE;
            applyFilters();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        // Source pills
        dom.sourcePills.addEventListener('click', e => {
            const pill = e.target.closest('.source-pill');
            if (!pill) return;
            activeSource = pill.dataset.src;
            shown = PER_PAGE;
            renderSources();
            applyFilters();
        });

        // Search
        let debounce;
        dom.search.addEventListener('input', e => {
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                query = e.target.value.trim();
                shown = PER_PAGE;
                applyFilters();
            }, 280);
        });

        // Load more
        dom.loadBtn.addEventListener('click', () => {
            shown += PER_PAGE;
            renderGrid(filtered);
        });

        // Refresh
        dom.refreshBtn.addEventListener('click', () => {
            if (!isFetching) refresh();
        });

        // Error retry
        dom.errorRetry.addEventListener('click', () => {
            dom.errorBanner.style.display = 'none';
            if (!isFetching) refresh();
        });
    }

    /* =============================================
       DATA INTEGRATION
       ============================================= */
    async function loadModelStats() {
        try {
            const res = await fetch(`${API_BASE}/stats`);
            const data = await res.json();
            
            dom.modelAlgo.textContent = data.model_algorithm;
            dom.modelFeedbacks.textContent = data.total_feedbacks;
            dom.modelFeatures.textContent = data.vocab_features.toLocaleString();

            const dist = data.classes_distribution;
            const total = dist.bullish + dist.neutral + dist.bearish;
            
            let bullP = 33.3, neuP = 33.3, bearP = 33.4;
            if (total > 0) {
                bullP = (dist.bullish / total) * 100;
                neuP = (dist.neutral / total) * 100;
                bearP = (dist.bearish / total) * 100;
            }

            dom.distBull.style.width = `${bullP}%`;
            dom.distNeutral.style.width = `${neuP}%`;
            dom.distBear.style.width = `${bearP}%`;

            dom.lblBullCount.textContent = dist.bullish;
            dom.lblNeuCount.textContent = dist.neutral;
            dom.lblBearCount.textContent = dist.bearish;
        } catch (err) {
            console.error('Failed to load model stats:', err);
        }
    }

    async function refreshNewsQuietly() {
        try {
            const res = await fetch(`${API_BASE}/news`);
            articles = await res.json();
            applyFilters();
        } catch (_) {}
    }

    async function refresh() {
        isFetching = true;
        dom.refreshBtn.classList.add('spinning');

        try {
            const res = await fetch(`${API_BASE}/news`);
            articles = await res.json();
            
            dom.errorBanner.style.display = 'none';
            
            // Extract distinct feed sources
            const sources = [...new Set(articles.map(a => a.source))].sort();
            renderFooter(sources);

            renderSources();
            applyFilters();
            await loadModelStats();
            dom.lastUpdated.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (_) {
            showError('Kesalahan jaringan saat menghubungkan ke server Python Edsans. Apakah server.py berjalan?');
        } finally {
            isFetching = false;
            dom.refreshBtn.classList.remove('spinning');
        }
    }

    function showError(msg) {
        dom.errorText.textContent = msg;
        dom.errorBanner.style.display = '';
    }

    /* =============================================
       INIT
       ============================================= */
    async function init() {
        dom.dateEl.textContent = fmtDate();
        initTicker();
        bindEvents();
        await refresh();

        // Auto-refresh every 5 minutes
        setInterval(() => {
            if (!isFetching) refresh();
        }, REFRESH_MS);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
