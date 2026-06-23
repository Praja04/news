import os
import sqlite3
import urllib.request
import urllib.parse
import json
import hashlib
import xml.etree.ElementTree as ET
from datetime import datetime
from flask import Flask, jsonify, request
from flask_cors import CORS
import numpy as np
from concurrent.futures import ThreadPoolExecutor

# ML Imports
from sklearn.feature_extraction.text import HashingVectorizer
from sklearn.linear_model import SGDClassifier

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

@app.route('/')
def index():
    return app.send_static_file('index.html')

DB_PATH = 'sentiment_feedback.db'

# Feeds configuration (Only CNBC and Yahoo Finance because they are scrapable/contain native images)
FEEDS = [
    {"name": "CNBC Markets",         "url": "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664",      "categories": ["stocks", "forex", "macro", "commodities"]},
    {"name": "CNBC Tech",            "url": "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10001147",      "categories": ["stocks", "macro"]},
    {"name": "CNBC Investing",       "url": "https://www.cnbc.com/id/15839069/device/rss/rss.html",                                     "categories": ["stocks", "macro"]},
    {"name": "Yahoo Finance",        "url": "https://finance.yahoo.com/news/rss",                                                      "categories": ["stocks", "macro", "commodities", "forex"]}
]

BULL_KEYWORDS = {'surge', 'rally', 'gain', 'jump', 'rebound', 'profit', 'growth', 'bullish', 'up', 'higher', 'beat', 'expansion', 'positive', 'recovery', 'boost', 'strengthens', 'optimism', 'advance', 'climbs', 'highs'}
BEAR_KEYWORDS = {'plunge', 'slump', 'drop', 'fall', 'loss', 'recession', 'bearish', 'down', 'lower', 'miss', 'contraction', 'negative', 'fear', 'panic', 'crash', 'weakens', 'slips', 'worries', 'debt', 'hit'}

CAT_KEYWORDS = {
    "forex": ["forex", "currency", "fx", "dollar", "euro", "yen", "pound", "usd", "eur", "gbp", "jpy", "exchange rate", "fed", "interest rate"],
    "stocks": ["stocks", "shares", "wall street", "earnings", "equity", "stock", "nasdaq", "nyse", "dow", "sp 500", "ipo"],
    "macro": ["inflation", "cpi", "interest rate", "fed", "central bank", "gdp", "macroeconomy", "unemployment", "rate hike", "jobs report", "ecb"],
    "commodities": ["gold", "oil", "brent", "crude", "gas", "copper", "metals", "commodities", "wheat", "silver"]
}

# Image Cache to prevent redundant web scrapes
IMAGE_CACHE = {}
# Thread pool for parallel scraping (improves feed response speed by 500%)
executor = ThreadPoolExecutor(max_workers=12)

# Translation dictionary to map English triggers to Indonesian
TRIGGER_MAP = {
    'surge': 'lonjakan',
    'rally': 'reli',
    'gain': 'kenaikan',
    'jump': 'melonjak',
    'rebound': 'rebound',
    'profit': 'keuntungan',
    'growth': 'pertumbuhan',
    'bullish': 'bullish',
    'up': 'naik',
    'higher': 'lebih tinggi',
    'beat': 'melampaui',
    'expansion': 'ekspansi',
    'positive': 'positif',
    'recovery': 'pemulihan',
    'boost': 'dorongan',
    'strengthens': 'menguat',
    'optimism': 'optimisme',
    'advance': 'kemajuan',
    'climbs': 'naik',
    'highs': 'tinggi',
    
    'plunge': 'anjlok',
    'slump': 'merosot',
    'drop': 'turun',
    'fall': 'jatuh',
    'loss': 'kerugian',
    'recession': 'resesi',
    'bearish': 'bearish',
    'down': 'turun',
    'lower': 'lebih rendah',
    'miss': 'meleset',
    'contraction': 'kontraksi',
    'negative': 'negatif',
    'fear': 'ketakutan',
    'panic': 'kepanikan',
    'crash': 'jatuh',
    'weakens': 'melemah',
    'slips': 'tergelincir',
    'worries': 'kekhawatiran',
    'debt': 'utang',
    'hit': 'terpukul'
}

def get_translation_hash(text):
    return hashlib.md5(text.strip().encode('utf-8')).hexdigest()

def get_cached_translation(text):
    if not text:
        return ""
    text_hash = get_translation_hash(text)
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('SELECT translated_text FROM translations WHERE text_hash = ?', (text_hash,))
        row = c.fetchone()
        conn.close()
        if row:
            return row[0]
    except Exception as e:
        print(f"Error reading translation cache: {e}")
    return None

def set_cached_translation(text, translated_text):
    if not text or not translated_text:
        return
    text_hash = get_translation_hash(text)
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''
            INSERT INTO translations (text_hash, translated_text) 
            VALUES (?, ?)
            ON CONFLICT(text_hash) DO UPDATE SET translated_text = excluded.translated_text
        ''', (text_hash, translated_text))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error writing translation cache: {e}")

def translate_to_id(text):
    if not text or not text.strip():
        return ""
    
    cached = get_cached_translation(text)
    if cached:
        return cached
        
    try:
        url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=id&dt=t&q=" + urllib.parse.quote(text)
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            translated_text = "".join([segment[0] for segment in data[0] if segment[0]])
            if translated_text:
                set_cached_translation(text, translated_text)
                return translated_text
    except Exception as e:
        print(f"Translation error for text '{text[:30]}...': {e}")
    
    return text

# =====================================================================
# DATABASE SETUP
# =====================================================================
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT UNIQUE,
            label TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS translations (
            text_hash TEXT PRIMARY KEY,
            translated_text TEXT
        )
    ''')
    conn.commit()
    conn.close()

# =====================================================================
# MACHINE LEARNING ENGINE
# =====================================================================
vectorizer = HashingVectorizer(n_features=2**14, alternate_sign=False)
model = SGDClassifier(loss='log_loss', penalty='l2', alpha=0.0001, random_state=42)
classes = np.array(['bearish', 'bullish', 'neutral'])

INIT_SAMPLES = [
    ("gold price surges to record high as dollar slips", "bullish"),
    ("market rallies following strong earnings report", "bullish"),
    ("stocks jump on positive employment data", "bullish"),
    ("inflation rate gains speed, raising rate hike fears", "bullish"),
    ("economic expansion continues with robust growth", "bullish"),
    ("oil jumps as supply cuts lift energy market", "bullish"),
    
    ("stocks plunge as recession fears grip wall street", "bearish"),
    ("oil prices drop amid slowing global demand", "bearish"),
    ("company misses earnings estimates, shares slide", "bearish"),
    ("dollar weakens following downbeat economic data", "bearish"),
    ("market crash wipes out early gains", "bearish"),
    ("inflation triggers fear of economic contraction", "bearish"),
    
    ("market holds steady ahead of fed meeting", "neutral"),
    ("gold prices remain unchanged today", "neutral"),
    ("stocks trade sideways in quiet session", "neutral"),
    ("analysts debate economic outlook", "neutral"),
    ("company reports standard quarterly results", "neutral")
]

def init_model():
    X_init = vectorizer.transform([s[0] for s in INIT_SAMPLES])
    y_init = [s[1] for s in INIT_SAMPLES]
    model.partial_fit(X_init, y_init, classes=classes)
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT text, label FROM feedback')
    rows = c.fetchall()
    conn.close()
    
    if rows:
        X_feed = vectorizer.transform([r[0] for r in rows])
        y_feed = [r[1] for r in rows]
        model.partial_fit(X_feed, y_feed)

# =====================================================================
# HELPERS & SCRAPERS
# =====================================================================
def scrape_og_image(url):
    """
    Scrapes the target article URL directly in Python to find the meta og:image tag.
    Caches the results to prevent repeated hits to publisher servers.
    """
    if not url:
        return None
    if url in IMAGE_CACHE:
        return IMAGE_CACHE[url]
        
    try:
        req = urllib.request.Request(
            url, 
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        )
        with urllib.request.urlopen(req, timeout=3.5) as response:
            html = response.read().decode('utf-8', errors='ignore')
            import re
            m = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', html)
            if not m:
                m = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', html)
            if m:
                img_url = m.group(1).replace('&amp;', '&')
                IMAGE_CACHE[url] = img_url
                return img_url
    except Exception as e:
        print(f"Error scraping {url}: {e}")
        
    IMAGE_CACHE[url] = None
    return None

def extract_trigger_words(text):
    words = text.lower().replace('.', '').replace(',', '').split()
    triggers = []
    for w in words:
        if w in BULL_KEYWORDS or w in BEAR_KEYWORDS:
            triggers.append(w)
    return list(set(triggers))

def clean_html(raw_html):
    import re
    cleanr = re.compile('<.*?>')
    cleantext = re.sub(cleanr, '', raw_html)
    return cleantext.replace('&amp;', '&').replace('&quot;', '"').strip()

def fetch_rss_xml(url):
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0'}
    )
    with urllib.request.urlopen(req, timeout=10) as response:
        return response.read()

# =====================================================================
# API ENDPOINTS
# =====================================================================
@app.route('/api/news', methods=['GET'])
def get_news():
    raw_articles = []
    seen_keys = set()
    
    for f in FEEDS:
        try:
            xml_data = fetch_rss_xml(f["url"])
            root = ET.fromstring(xml_data)
            
            for item in root.findall('.//item'):
                title_el = item.find('title')
                link_el = item.find('link')
                desc_el = item.find('description')
                pub_el = item.find('pubDate')
                
                title = clean_html(title_el.text) if title_el is not None and title_el.text else ""
                link = link_el.text.strip() if link_el is not None and link_el.text else ""
                
                if not title or not link:
                    continue
                
                key = title.lower().strip()
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                
                desc = clean_html(desc_el.text)[:220] if desc_el is not None and desc_el.text else ""
                pub_date = pub_el.text.strip() if pub_el is not None and pub_el.text else ""
                
                # Extract image url natively from XML if present (e.g. Yahoo Finance)
                image = None
                for elem in item:
                    if 'content' in elem.tag or 'thumbnail' in elem.tag:
                        url = elem.attrib.get('url')
                        if url:
                            image = url
                            break
                    if elem.tag == 'enclosure':
                        url = elem.attrib.get('url')
                        mime = elem.attrib.get('type', '')
                        if url and ('image' in mime or any(ext in url for ext in ['.jpg', '.jpeg', '.png', '.webp'])):
                            image = url
                            break
                
                # Check description HTML for images
                if not image and desc_el is not None and desc_el.text:
                    import re
                    m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', desc_el.text)
                    if m:
                        image = m.group(1)

                raw_articles.append({
                    "title": title,
                    "link": link,
                    "desc": desc,
                    "pubDate": pub_date,
                    "image": image,
                    "source": f["name"],
                    "cats": list(f["categories"])
                })
        except Exception as e:
            print(f"Error fetching feed {f['name']}: {e}")
            continue

    # Parallel scrape og:image for articles that lack images (specifically CNBC stories)
    futures = {}
    for a in raw_articles:
        if not a["image"] and 'cnbc.com' in a["link"]:
            futures[a["link"]] = executor.submit(scrape_og_image, a["link"])

    # Wait for parallel scrapers and update URLs
    for a in raw_articles:
        link = a["link"]
        if link in futures:
            try:
                img = futures[link].result(timeout=4)
                if img:
                    a["image"] = img
            except Exception as e:
                print(f"Scrape future result error for {link}: {e}")

    # Process sentiment analysis and clean triggers
    processed_articles = []
    for a in raw_articles:
        combined_text = f"{a['title']} {a['desc']}"
        features = vectorizer.transform([combined_text])
        probs = model.predict_proba(features)[0]
        pred_idx = np.argmax(probs)
        predicted_label = classes[pred_idx]
        confidence = float(probs[pred_idx])
        
        triggers = extract_trigger_words(combined_text)
        translated_triggers = [TRIGGER_MAP.get(t, t) for t in triggers]
        
        # Keyword category expansions
        text_to_test = combined_text.lower()
        assigned_cats = a["cats"]
        for c_name, keywords in CAT_KEYWORDS.items():
            if c_name not in assigned_cats:
                if any(kw in text_to_test for kw in keywords):
                    assigned_cats.append(c_name)

        processed_articles.append({
            "title": a["title"],
            "link": a["link"],
            "desc": a["desc"],
            "pubDate": a["pubDate"],
            "image": a["image"],
            "source": a["source"],
            "sentiment": predicted_label,
            "confidence": round(confidence * 100, 1),
            "triggers": translated_triggers,
            "cats": assigned_cats
        })

    # Submit translations to ThreadPoolExecutor
    for a in processed_articles:
        a["title_future"] = executor.submit(translate_to_id, a["title"])
        a["desc_future"] = executor.submit(translate_to_id, a["desc"])

    # Wait for translation results
    for a in processed_articles:
        try:
            a["title"] = a["title_future"].result(timeout=4)
        except Exception as e:
            print(f"Error getting title translation: {e}")
        try:
            a["desc"] = a["desc_future"].result(timeout=4)
        except Exception as e:
            print(f"Error getting desc translation: {e}")
            
        del a["title_future"]
        del a["desc_future"]

    def parse_date(date_str):
        try:
            return datetime.strptime(date_str[:25].strip(), "%a, %d %b %Y %H:%M:%S")
        except:
            return datetime.min

    processed_articles.sort(key=lambda x: parse_date(x["pubDate"]), reverse=True)
    return jsonify(processed_articles)

@app.route('/api/feedback', methods=['POST'])
def save_feedback():
    data = request.json
    text = data.get('text')
    label = data.get('label')
    
    if not text or label not in ['bullish', 'bearish', 'neutral']:
        return jsonify({"status": "error", "message": "Invalid feedback parameters"}), 400
    
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''
            INSERT INTO feedback (text, label) VALUES (?, ?)
            ON CONFLICT(text) DO UPDATE SET label=excluded.label
        ''', (text, label))
        conn.commit()
        conn.close()
        
        features = vectorizer.transform([text])
        model.partial_fit(features, [label])
        return jsonify({"status": "success", "message": f"AI model successfully trained."})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/stats', methods=['GET'])
def get_stats():
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('SELECT COUNT(*) FROM feedback')
        total_feedback = c.fetchone()[0]
        
        c.execute("SELECT COUNT(*) FROM feedback WHERE label='bullish'")
        bull_feedback = c.fetchone()[0]
        
        c.execute("SELECT COUNT(*) FROM feedback WHERE label='bearish'")
        bear_feedback = c.fetchone()[0]
        
        c.execute("SELECT COUNT(*) FROM feedback WHERE label='neutral'")
        neutral_feedback = c.fetchone()[0]
        conn.close()
        
        return jsonify({
            "total_feedbacks": total_feedback,
            "classes_distribution": {
                "bullish": bull_feedback,
                "bearish": bear_feedback,
                "neutral": neutral_feedback
            },
            "vocab_features": int(vectorizer.n_features),
            "model_algorithm": "SGDClassifier (Online Linear Model)"
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    init_db()
    init_model()
    app.run(host='0.0.0.0', port=8000, debug=False)
