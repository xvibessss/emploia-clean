export default function handler(req, res) {
  res.status(200).json({
    hasRapidKey: !!process.env.RAPIDAPI_KEY,
    hasAdzunaId: !!process.env.ADZUNA_APP_ID,
    hasFTClient: !!process.env.FRANCE_TRAVAIL_CLIENT_ID,
    rapidKeyLength: (process.env.RAPIDAPI_KEY || '').length,
    rapidKeyStart: (process.env.RAPIDAPI_KEY || '').slice(0, 8),
    allKeys: Object.keys(process.env).filter(k => 
      ['RAPIDAPI', 'ADZUNA', 'FRANCE', 'JSEARCH', 'ANTHROPIC'].some(p => k.startsWith(p))
    ),
  });
}
