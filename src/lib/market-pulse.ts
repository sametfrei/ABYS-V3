export interface MarketQuote {
  label: string;
  value: string;
  changePct: number | null;
}

export interface WeatherInfo {
  city: string;
  temperature: number;
  description: string;
}

export interface MarketPulse {
  quotes: MarketQuote[];
  weather: WeatherInfo | null;
}

const YAHOO_SYMBOLS: { symbol: string; label: string; format: (v: number) => string }[] = [
  { symbol: "BZ=F", label: "BRENT PETROL", format: (v) => `${v.toFixed(2)} $` },
  { symbol: "GC=F", label: "ALTIN (XAU)", format: (v) => `${v.toFixed(2)} $` },
  { symbol: "ZW=F", label: "BUĞDAY", format: (v) => `${v.toFixed(0)} $` },
  { symbol: "XU100.IS", label: "BİST 100", format: (v) => v.toLocaleString("tr-TR", { maximumFractionDigits: 2 }) },
];

const WEATHER_CODES: Record<number, string> = {
  0: "Açık",
  1: "Az bulutlu",
  2: "Parçalı bulutlu",
  3: "Kapalı",
  45: "Sisli",
  48: "Kırağı sisi",
  51: "Hafif çisenti",
  61: "Hafif yağmur",
  63: "Yağmur",
  65: "Kuvvetli yağmur",
  71: "Hafif kar",
  73: "Kar",
  75: "Kuvvetli kar",
  80: "Sağanak",
  95: "Fırtına",
};

async function fetchYahooQuote(symbol: string): Promise<{ price: number; prevClose: number } | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 300 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    return { price: meta.regularMarketPrice, prevClose: meta.chartPreviousClose ?? meta.regularMarketPrice };
  } catch {
    return null;
  }
}

async function fetchUsdTry(): Promise<MarketQuote | null> {
  try {
    const res = await fetch("https://www.tcmb.gov.tr/kurlar/today.xml", { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const xml = await res.text();
    const match = xml.match(/Kod="USD"[\s\S]*?<ForexSelling>([\d.]+)<\/ForexSelling>/);
    if (!match) return null;
    const value = parseFloat(match[1]);
    return { label: "USD/TRY", value: value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), changePct: null };
  } catch {
    return null;
  }
}

async function fetchWeather(): Promise<WeatherInfo | null> {
  try {
    const res = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=41.01&longitude=28.97&current_weather=true",
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const cw = data?.current_weather;
    if (!cw) return null;
    return {
      city: "İstanbul",
      temperature: cw.temperature,
      description: WEATHER_CODES[cw.weathercode] ?? "—",
    };
  } catch {
    return null;
  }
}

export async function getMarketPulse(): Promise<MarketPulse> {
  const [usdTry, weather, ...yahooResults] = await Promise.all([
    fetchUsdTry(),
    fetchWeather(),
    ...YAHOO_SYMBOLS.map((s) => fetchYahooQuote(s.symbol)),
  ]);

  const quotes: MarketQuote[] = [];
  if (usdTry) quotes.push(usdTry);

  YAHOO_SYMBOLS.forEach((s, i) => {
    const q = yahooResults[i];
    if (!q) return;
    const changePct = q.prevClose ? ((q.price - q.prevClose) / q.prevClose) * 100 : null;
    quotes.push({ label: s.label, value: s.format(q.price), changePct });
  });

  return { quotes, weather };
}
