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

        // XEDY V10 UI
        xedyBias      : $('xedyBias'),
        xedyBiasBox   : $('xedyBiasBox'),
        xedyConf      : $('xedyConf'),
        xedyConfBar   : $('xedyConfBar'),
        xedyRisk      : $('xedyRisk'),
        xedySupport   : $('xedySupport'),
        xedyResistance: $('xedyResistance'),
        xedyTriggers  : $('xedyTriggers'),
        xedySummary   : $('xedySummary'),
        xedyTimestamp : $('xedyTimestamp'),

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

    // --- XEDY V10 Intelligence Report ---
    async function loadXedyReport() {
        try {
            const res = await fetch(`${API_BASE}/xedy`);
            const data = await res.json();

            if (data.status === 'empty') {
                // No report yet — show placeholder
                dom.xedySummary.textContent = data.message || 'Belum ada laporan.';
                return;
            }

            // Bias
            const bias = (data.bias || '—').toUpperCase();
            dom.xedyBias.textContent = bias;
            dom.xedyBiasBox.className = 'xedy-bias-box';
            if (/BUY|BULLISH|LONG/i.test(bias)) dom.xedyBiasBox.classList.add('bullish');
            else if (/SELL|BEARISH|SHORT/i.test(bias)) dom.xedyBiasBox.classList.add('bearish');
            else dom.xedyBiasBox.classList.add('neutral');

            // Confidence
            const conf = data.confidence || data.confidence_score || 0;
            dom.xedyConf.textContent = `${conf}%`;
            dom.xedyConfBar.style.width = `${Math.min(conf, 100)}%`;
            if (conf >= 70) dom.xedyConfBar.style.background = 'var(--green)';
            else if (conf >= 40) dom.xedyConfBar.style.background = 'var(--gold)';
            else dom.xedyConfBar.style.background = 'var(--red)';

            // Risk
            const risk = (data.risk || data.risk_assessment || '—').toUpperCase();
            dom.xedyRisk.textContent = risk;
            dom.xedyRisk.className = 'xedy-risk-badge';
            if (/HIGH|TINGGI/i.test(risk)) dom.xedyRisk.classList.add('high');
            else if (/MEDIUM|SEDANG/i.test(risk)) dom.xedyRisk.classList.add('medium');
            else if (/LOW|RENDAH/i.test(risk)) dom.xedyRisk.classList.add('low');

            // Key Levels
            if (data.key_levels) {
                const sup = data.key_levels.support || data.key_levels.Support || [];
                const res2 = data.key_levels.resistance || data.key_levels.Resistance || [];
                dom.xedySupport.innerHTML = (Array.isArray(sup) ? sup : [sup]).map(v => `<span class="xedy-level-val">${v}</span>`).join('');
                dom.xedyResistance.innerHTML = (Array.isArray(res2) ? res2 : [res2]).map(v => `<span class="xedy-level-val">${v}</span>`).join('');
            }

            // Triggers
            const triggers = data.triggers || data.pemicu || [];
            if (Array.isArray(triggers) && triggers.length > 0) {
                dom.xedyTriggers.innerHTML = triggers.map(t => `<span class="xedy-trigger-tag">${escHtml(typeof t === 'string' ? t : t.name || t.trigger || JSON.stringify(t))}</span>`).join('');
            }

            // Summary
            const summary = data.summary || data.ringkasan || data.narrative || '';
            dom.xedySummary.textContent = summary || '—';

            // Timestamp
            const ts = data.timestamp || data._stored_at || '';
            if (ts) {
                const d = new Date(ts);
                dom.xedyTimestamp.textContent = `Terakhir diperbarui: ${isNaN(d) ? ts : d.toLocaleString('id-ID', {day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'})}`;
            }
        } catch (err) {
            console.error('Failed to load XEDY report:', err);
        }
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
       FORECAST CARDS & SPEECH-TO-TEXT SIMULATION
       ============================================= */
    const FORECAST_CARDS = [
        {
            pair: 'XAUUSD',
            bias: 'BEARISH',
            h4: { bull: 28, bear: 72, range: '$4.080 - $4.140', acc: 85 },
            d1: { bull: 32, bear: 68, range: '$4.020 - $4.155', acc: 85 },
            macro: 'Kombinasi Fed hawkish, DXY 101, dan real yield 2.21% menciptakan triple bearish pressure. Harga di bawah MA200 dengan indikasi death cross. GS memotong target dari $5.400 ke $4.900.'
        },
        {
            pair: 'USDJPY',
            bias: 'BULLISH',
            h4: { bull: 55, bear: 45, range: '161.20 - 162.30', acc: 78 },
            d1: { bull: 48, bear: 52, range: '159.50 - 163.00', acc: 75 },
            macro: 'Selisih suku bunga AS-Jepang (275bps) terus mendorong pair naik. Namun, posisi COT short Yen sebesar 145.8K memicu risiko short squeeze yang tinggi. MoF bersiap intervensi di atas level 162.'
        },
        {
            pair: 'WTI OIL',
            bias: 'BEARISH',
            h4: { bull: 35, bear: 65, range: '$72.50 - $74.50', acc: 80 },
            d1: { bull: 38, bear: 62, range: '$71.00 - $75.00', acc: 78 },
            macro: 'Kesepakatan AS-Iran memangkas geopolitical premium secara signifikan. Penguatan DXY turut menekan harga komoditas.'
        },
        {
            pair: 'EURUSD',
            bias: 'BEARISH',
            h4: { bull: 42, bear: 58, range: '1.1380 - 1.1460', acc: 75 },
            d1: { bull: 45, bear: 55, range: '1.1320 - 1.1500', acc: 73 },
            macro: 'Sikap ECB yang netral berhadapan dengan Fed yang hawkish membuat EUR tertekan secara moderat. Terjadi deleveraging pada COT sebesar -34.9K kontrak.'
        },
        {
            pair: 'GBPUSD',
            bias: 'BEARISH',
            h4: { bull: 44, bear: 56, range: '1.3190 - 1.3280', acc: 72 },
            d1: { bull: 46, bear: 54, range: '1.3150 - 1.3320', acc: 70 },
            macro: 'BoE diperkirakan menahan suku bunga tanpa katalis tambahan. Dominasi DXY membuat GBP bergerak defensif.'
        }
    ];

    function renderForecastCards() {
        const grid = document.getElementById('forecastCardsGrid');
        if (!grid) return;

        grid.innerHTML = FORECAST_CARDS.map((item, index) => {
            const isBullish = item.bias === 'BULLISH';
            const badgeClass = isBullish ? 'bullish' : 'bearish';
            const glowClass = isBullish ? 'bullish-glow' : 'bearish-glow';
            const spanClass = (index === FORECAST_CARDS.length - 1 && FORECAST_CARDS.length % 2 !== 0) ? 'span-2' : '';
            
            return `
                <div class="forecast-card ${glowClass} ${spanClass}">
                    <div class="forecast-card-header">
                        <span class="forecast-card-pair">${item.pair}</span>
                        <span class="forecast-badge ${badgeClass}">${item.bias}</span>
                    </div>
                    
                    <div class="forecast-timeframe-box">
                        <span class="forecast-tf-label">4H FORECAST</span>
                        <div class="forecast-tf-row">
                            <span class="forecast-tf-bias ${badgeClass}">${isBullish ? `BULL ${item.h4.bull}%` : `BEAR ${item.h4.bear}%`}</span>
                            <span class="forecast-tf-range">${item.h4.range}</span>
                        </div>
                        <div class="forecast-tf-acc">Akurasi: ${item.h4.acc}%</div>
                    </div>

                    <div class="forecast-timeframe-box">
                        <span class="forecast-tf-label">1D FORECAST</span>
                        <div class="forecast-tf-row">
                            <span class="forecast-tf-bias ${badgeClass}">${isBullish ? `BULL ${item.d1.bull}%` : `BEAR ${item.d1.bear}%`}</span>
                            <span class="forecast-tf-range">${item.d1.range}</span>
                        </div>
                        <div class="forecast-tf-acc">Akurasi: ${item.d1.acc}%</div>
                    </div>

                    <div class="forecast-macro-box" title="${escHtml(item.macro)}">
                        ${escHtml(item.macro)}
                    </div>
                </div>
            `;
        }).join('');
    }

    const TRANSCRIPT_LINES = [
        "CNBC INDONESIA: ...selamat pagi pemirsa, kembali lagi di live streaming program Squawk Box CNBC Indonesia...",
        "CNBC INDONESIA: ...bersama saya hari ini, kita akan membahas pergerakan pasar komoditas yang cukup volatile...",
        "CNBC INDONESIA: ...harga emas dunia terpantau di level $4,116 per troy ounce, mengalami pelemahan sebesar 1.86%...",
        "CNBC INDONESIA: ...selisih yield obligasi US 10-Tahun yang berada di 4.51% meningkatkan opportunity cost emas...",
        "CNBC INDONESIA: ...analis memperkirakan harga emas berisiko mendekati level support terdekat di $4,080...",
        "CNBC INDONESIA: ...seperti rilis data yang kami terima, The Fed diperkirakan menahan suku bunga lebih lama...",
        "CNBC INDONESIA: ...mari kita hubungkan langsung dengan pengamat pasar forex di bursa Tokyo...",
        "CNBC INDONESIA: ...nilai tukar USD/JPY masih tertahan di atas level 161.71, memicu sinyal intervensi verbal dari MoF...",
        "CNBC INDONESIA: ...Wakil Menteri Keuangan Jepang, Masato Katayama, menyatakan ketidaknyamanan terhadap spekulasi berlebih...",
        "CNBC INDONESIA: ...posisi COT spekulatif untuk Yen menunjukkan posisi net-short mencapai level ekstrem 145.8K kontrak...",
        "CNBC INDONESIA: ...banyak spekulan bersiap menghadapi potensi short squeeze mendadak jika intervensi dilakukan...",
        "CNBC INDONESIA: ...di sisi lain, bursa saham wall street melemah menyusul pelemahan saham-saham teknologi raksasa...",
        "CNBC INDONESIA: ...sentimen pasar komoditas minyak mentah WTI berada di kisaran $73.80 per barel...",
        "CNBC INDONESIA: ...kesepakatan antara AS dan Iran memangkas premi risiko geopolitik secara signifikan di pasar energi...",
        "CNBC INDONESIA: ...investor bersiap menghadapi rilis data inflasi PCE esok hari untuk melihat kejelasan kebijakan Fed...",
        "CNBC INDONESIA: ...terima kasih, demikian laporan singkat pergerakan pasar hari ini. Kami kembali ke studio..."
    ];

    let transcriptIndex = 0;
    function initSpeechToText() {
        const scrollContainer = document.getElementById('transcriptScroll');
        if (!scrollContainer) return;

        scrollContainer.innerHTML = '';

        addTranscriptLine("SISTEM: Menghubungkan ke audio stream CNBC Indonesia Live TV...");
        
        setTimeout(() => {
            addTranscriptLine("SISTEM: Koneksi audio stabil. Memulai speech-to-text transkripsi...");
        }, 1500);

        setInterval(() => {
            const line = TRANSCRIPT_LINES[transcriptIndex];
            addTranscriptLine(line);
            transcriptIndex = (transcriptIndex + 1) % TRANSCRIPT_LINES.length;
        }, 8000);
    }

    function addTranscriptLine(text) {
        const scrollContainer = document.getElementById('transcriptScroll');
        if (!scrollContainer) return;

        const p = document.createElement('p');
        p.className = 'transcript-line live';
        
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        p.innerHTML = `<span style="color: var(--text-muted); font-size: 10px;">[${timestamp}]</span> ${escHtml(text)}`;
        
        scrollContainer.appendChild(p);
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        
        while (scrollContainer.children.length > 50) {
            scrollContainer.removeChild(scrollContainer.firstChild);
        }
    }

    /* =============================================
       INIT
       ============================================= */
    async function init() {
        dom.dateEl.textContent = fmtDate();
        initTicker();
        bindEvents();
        await refresh();
        await loadXedyReport();
        renderForecastCards();
        initSpeechToText();

        // Auto-refresh every 5 minutes
        setInterval(() => {
            if (!isFetching) refresh();
        }, REFRESH_MS);

        // Refresh XEDY report every 10 minutes
        setInterval(() => {
            loadXedyReport();
        }, 10 * 60 * 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
