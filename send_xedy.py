import urllib.request
import json

report = {
    "timestamp": "2026-06-23T11:22:00+07:00",
    "bias": "SELL ON RALLY",
    "confidence": 68,
    "risk": "MEDIUM-HIGH",
    "key_levels": {
        "support": [4155, 4100, 4050, 4020],
        "resistance": [4200, 4265, 4300, 4350]
    },
    "triggers": [
        "Fed hawkish - suku bunga ditahan di 3.50-3.75%, 9 pejabat proyeksikan kenaikan",
        "DXY menguat di level 100-101, menekan harga emas",
        "Real yield 10Y naik ke 2.21%, opportunity cost emas meningkat",
        "Goldman Sachs pangkas target emas dari $5400 ke $4900",
        "Kemajuan perundingan AS-Iran kurangi permintaan safe-haven",
        "Death cross 50/200 DMA mengancam, sinyal bearish teknikal",
        "CPI headline 4.2%, inflasi tetap sticky"
    ],
    "summary": (
        "XAUUSD diperdagangkan di kisaran $4,140-$4,160/oz pada 23 Juni 2026, mengalami tekanan "
        "signifikan pasca pertemuan FOMC 16-17 Juni di bawah kepemimpinan baru Fed Chair Kevin Warsh. "
        "Suku bunga ditahan di 3.50-3.75% namun dot plot menunjukkan 9 dari 18 pejabat memproyeksikan "
        "minimal satu kenaikan suku bunga sebelum akhir 2026. DXY menguat di 100-101 didukung data NFP "
        "solid dan stance hawkish Fed. Real yield 10Y AS naik ke 2.21%, meningkatkan opportunity cost "
        "memegang emas. Secara teknikal, harga diperdagangkan di bawah MA 200 hari dengan ancaman death "
        "cross (MA 50 memotong MA 200 dari atas). Support kritis di $4,100-$4,120 — jika tembus bisa "
        "akselerasi ke $4,050-$4,020. Resistance terdekat $4,200-$4,220, harus break untuk ubah bias. "
        "Goldman Sachs telah menurunkan target akhir tahun dari $5,400 ke $4,900, sementara JPMorgan "
        "tetap bullish di $6,000 melihat koreksi sebagai peluang beli. Strategi institusional: SELL ON "
        "RALLY di area $4,200-$4,220 dengan SL di atas $4,265. BUY hanya jika harga mampu bertahan di "
        "atas $4,220 dengan konfirmasi volume."
    ),
    "gold_price_current": "$4,155",
    "dxy_level": "100-101",
    "fed_rate": "3.50-3.75%",
    "us_10y_yield": "4.51%",
    "real_yield_10y": "2.21%",
    "cpi_headline": "4.2%",
    "cpi_core": "2.9%",
    "institutional_views": {
        "goldman_sachs": "Target $4,900 (diturunkan dari $5,400)",
        "jpmorgan": "Target $6,000 (tetap bullish, buy the dip)"
    }
}

data = json.dumps(report, ensure_ascii=False).encode('utf-8')
req = urllib.request.Request(
    'http://127.0.0.1:8000/api/xedy',
    data=data,
    headers={'Content-Type': 'application/json'},
    method='POST'
)
with urllib.request.urlopen(req) as resp:
    result = json.loads(resp.read().decode('utf-8'))
    print(json.dumps(result, indent=2))
