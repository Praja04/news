# Edsans — Financial & Forex Intelligence Dashboard

Real-time financial news, price tickers, and sentiment analysis powered by a self-learning AI model (SGDClassifier).

## Features
- **Live Ticking Market Rates:** Real-time simulations for major forex pairs, indices, and crypto.
- **Client-Server Architecture:** Python Flask backend parses RSS feeds and runs local NLP predictions concurrently.
- **Self-Learning AI:** Retrains the classification model instantly upon receiving sentiment corrections.
- **Explainable AI:** Shows trigger keywords and model confidence probabilities.

## Setup on VPS

1. **Clone the repository:**
   ```bash
   git clone <YOUR_GITHUB_REPOSITORY_URL>
   cd global-news-dashboard
   ```

2. **Install dependencies:**
   Make sure you have Python 3 installed.
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the server:**
   To run it in the background on your VPS, you can use `nohup` or `pm2`:
   ```bash
   nohup python server.py > server.log 2>&1 &
   ```
   Or using `gunicorn` for production (optional).

4. **Access the app:**
   Open your browser and navigate to `http://<YOUR_VPS_IP>:8000`.
