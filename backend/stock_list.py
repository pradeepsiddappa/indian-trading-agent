"""Indian stock name-to-ticker mapping — offline fallback for typeahead search.

Live search now uses Yahoo Finance (see backend/routers/market_data.py, which
is always current and needs no bundled data). This curated list (NIFTY 50/100 +
popular mid/small caps) is only the offline fallback used when Yahoo is
unreachable.
"""

# Curated offline fallback: {ticker: company_name}
NSE_STOCKS = {
    "RELIANCE": "Reliance Industries Ltd",
    "TCS": "Tata Consultancy Services Ltd",
    "HDFCBANK": "HDFC Bank Ltd",
    "INFY": "Infosys Ltd",
    "ICICIBANK": "ICICI Bank Ltd",
    "HINDUNILVR": "Hindustan Unilever Ltd",
    "BHARTIARTL": "Bharti Airtel Ltd",
    "SBIN": "State Bank of India",
    "ITC": "ITC Ltd",
    "KOTAKBANK": "Kotak Mahindra Bank Ltd",
    "LT": "Larsen & Toubro Ltd",
    "AXISBANK": "Axis Bank Ltd",
    "BAJFINANCE": "Bajaj Finance Ltd",
    "ASIANPAINT": "Asian Paints Ltd",
    "MARUTI": "Maruti Suzuki India Ltd",
    "TITAN": "Titan Company Ltd",
    "SUNPHARMA": "Sun Pharmaceutical Industries Ltd",
    "TMPV": "Tata Motors Passenger Vehicles Ltd",
    "TMCV": "Tata Motors Commercial Vehicles Ltd",
    "WIPRO": "Wipro Ltd",
    "HCLTECH": "HCL Technologies Ltd",
    "M&M": "Mahindra & Mahindra Ltd",
    "ULTRACEMCO": "UltraTech Cement Ltd",
    "NESTLEIND": "Nestle India Ltd",
    "NTPC": "NTPC Ltd",
    "POWERGRID": "Power Grid Corporation of India Ltd",
    "TATASTEEL": "Tata Steel Ltd",
    "TECHM": "Tech Mahindra Ltd",
    "ONGC": "Oil and Natural Gas Corporation Ltd",
    "JSWSTEEL": "JSW Steel Ltd",
    "ADANIENT": "Adani Enterprises Ltd",
    "ADANIPORTS": "Adani Ports and SEZ Ltd",
    "BAJAJFINSV": "Bajaj Finserv Ltd",
    "BAJAJ-AUTO": "Bajaj Auto Ltd",
    "COALINDIA": "Coal India Ltd",
    "GRASIM": "Grasim Industries Ltd",
    "DRREDDY": "Dr. Reddys Laboratories Ltd",
    "CIPLA": "Cipla Ltd",
    "EICHERMOT": "Eicher Motors Ltd",
    "APOLLOHOSP": "Apollo Hospitals Enterprise Ltd",
    "BRITANNIA": "Britannia Industries Ltd",
    "BPCL": "Bharat Petroleum Corporation Ltd",
    "HEROMOTOCO": "Hero MotoCorp Ltd",
    "HINDALCO": "Hindalco Industries Ltd",
    "INDUSINDBK": "IndusInd Bank Ltd",
    "HDFCLIFE": "HDFC Life Insurance Company Ltd",
    "SBILIFE": "SBI Life Insurance Company Ltd",
    "TATACONSUM": "Tata Consumer Products Ltd",
    "BEL": "Bharat Electronics Ltd",
    "TRENT": "Trent Ltd",
    "ETERNAL": "Eternal Ltd (Zomato)",
    # NIFTY Next 50
    "ABB": "ABB India Ltd",
    "ABBOTINDIA": "Abbott India Ltd",
    "AMBUJACEM": "Ambuja Cements Ltd",
    "AUROPHARMA": "Aurobindo Pharma Ltd",
    "BANKBARODA": "Bank of Baroda",
    "BERGEPAINT": "Berger Paints India Ltd",
    "BOSCHLTD": "Bosch Ltd",
    "CANBK": "Canara Bank",
    "CHOLAFIN": "Cholamandalam Investment and Finance Co Ltd",
    "COLPAL": "Colgate-Palmolive India Ltd",
    "DABUR": "Dabur India Ltd",
    "DIVISLAB": "Divis Laboratories Ltd",
    "DLF": "DLF Ltd",
    "GAIL": "GAIL India Ltd",
    "GODREJCP": "Godrej Consumer Products Ltd",
    "HAVELLS": "Havells India Ltd",
    "ICICIPRULI": "ICICI Prudential Life Insurance",
    "INDHOTEL": "Indian Hotels Company Ltd",
    "IOC": "Indian Oil Corporation Ltd",
    "IRCTC": "Indian Railway Catering and Tourism Corp Ltd",
    "IRFC": "Indian Railway Finance Corporation Ltd",
    "JIOFIN": "Jio Financial Services Ltd",
    "JSWENERGY": "JSW Energy Ltd",
    "LICI": "Life Insurance Corporation of India",
    "LODHA": "Macrotech Developers (Lodha) Ltd",
    "LUPIN": "Lupin Ltd",
    "MANKIND": "Mankind Pharma Ltd",
    "MARICO": "Marico Ltd",
    "MAXHEALTH": "Max Healthcare Institute Ltd",
    "NHPC": "NHPC Ltd",
    "NMDC": "NMDC Ltd",
    "NAUKRI": "Info Edge (Naukri) India Ltd",
    "OBEROIRLTY": "Oberoi Realty Ltd",
    "OFSS": "Oracle Financial Services Software Ltd",
    "PAGEIND": "Page Industries Ltd",
    "PFC": "Power Finance Corporation Ltd",
    "PIDILITIND": "Pidilite Industries Ltd",
    "PNB": "Punjab National Bank",
    "POLYCAB": "Polycab India Ltd",
    "RECLTD": "REC Ltd",
    "SBICARD": "SBI Cards and Payment Services Ltd",
    "SHREECEM": "Shree Cement Ltd",
    "SIEMENS": "Siemens Ltd",
    "TORNTPHARM": "Torrent Pharmaceuticals Ltd",
    "TVSMOTOR": "TVS Motor Company Ltd",
    "UNIONBANK": "Union Bank of India",
    "VEDL": "Vedanta Ltd",
    "VBL": "Varun Beverages Ltd",
    "ZYDUSLIFE": "Zydus Lifesciences Ltd",
    # Popular additional stocks
    "ADANIGREEN": "Adani Green Energy Ltd",
    "ADANIPOWER": "Adani Power Ltd",
    "ALKEM": "Alkem Laboratories Ltd",
    "ASTRAL": "Astral Ltd",
    "BATAINDIA": "Bata India Ltd",
    "BHARATFORG": "Bharat Forge Ltd",
    "BIOCON": "Biocon Ltd",
    "CGPOWER": "CG Power and Industrial Solutions Ltd",
    "CUMMINSIND": "Cummins India Ltd",
    "DEEPAKNTR": "Deepak Nitrite Ltd",
    "DELHIVERY": "Delhivery Ltd",
    "DIXON": "Dixon Technologies India Ltd",
    "ESCORTS": "Escorts Kubota Ltd",
    "EXIDEIND": "Exide Industries Ltd",
    "FEDERALBNK": "Federal Bank Ltd",
    "FORTIS": "Fortis Healthcare Ltd",
    "GLENMARK": "Glenmark Pharmaceuticals Ltd",
    "HAL": "Hindustan Aeronautics Ltd",
    "HDFCAMC": "HDFC Asset Management Company Ltd",
    "HINDPETRO": "Hindustan Petroleum Corporation Ltd",
    "IDFCFIRSTB": "IDFC First Bank Ltd",
    "IEX": "Indian Energy Exchange Ltd",
    "INDIANB": "Indian Bank",
    "INDIAMART": "IndiaMART InterMESH Ltd",
    "IPCA": "IPCA Laboratories Ltd",
    "JUBLFOOD": "Jubilant FoodWorks Ltd",
    "KEI": "KEI Industries Ltd",
    "LALPATHLAB": "Dr Lal PathLabs Ltd",
    "LICHSGFIN": "LIC Housing Finance Ltd",
    "LTTS": "L&T Technology Services Ltd",
    "M&MFIN": "Mahindra & Mahindra Financial Services Ltd",
    "METROPOLIS": "Metropolis Healthcare Ltd",
    "MPHASIS": "Mphasis Ltd",
    "MRF": "MRF Ltd",
    "MUTHOOTFIN": "Muthoot Finance Ltd",
    "NATIONALUM": "National Aluminium Company Ltd",
    "PERSISTENT": "Persistent Systems Ltd",
    "PETRONET": "Petronet LNG Ltd",
    "PIIND": "PI Industries Ltd",
    "PRESTIGE": "Prestige Estates Projects Ltd",
    "PVRINOX": "PVR INOX Ltd",
    "SAIL": "Steel Authority of India Ltd",
    "SRF": "SRF Ltd",
    "TATAELXSI": "Tata Elxsi Ltd",
    "TATAPOWER": "Tata Power Company Ltd",
    "TORNTPOWER": "Torrent Power Ltd",
    "UBL": "United Breweries Ltd",
    "UPL": "UPL Ltd",
    "VOLTAS": "Voltas Ltd",
    "YESBANK": "Yes Bank Ltd",
    "ZOMATO": "Zomato Ltd",
    "ZEEL": "Zee Entertainment Enterprises Ltd",
    "RVNL": "Rail Vikas Nigam Ltd",
    "CONCOR": "Container Corporation of India Ltd",
    "GMRINFRA": "GMR Airports Infrastructure Ltd",
    "KALYANKJIL": "Kalyan Jewellers India Ltd",
    "STARHEALTH": "Star Health and Allied Insurance Co Ltd",
    "TRIDENT": "Trident Ltd",
    "WHIRLPOOL": "Whirlpool of India Ltd",
}


def search_stocks(query: str, limit: int = 10) -> list[dict]:
    """Search stocks by ticker or company name. Returns matching results."""
    query = query.strip().upper()
    if not query:
        return []

    results = []
    query_lower = query.lower()

    for ticker, name in NSE_STOCKS.items():
        # Match ticker prefix or company name substring
        ticker_match = ticker.upper().startswith(query)
        name_match = query_lower in name.lower()

        if ticker_match or name_match:
            # Score: exact ticker match > ticker prefix > name match
            score = 0
            if ticker.upper() == query:
                score = 100
            elif ticker_match:
                score = 50
            elif name_match:
                score = 10

            results.append({
                "ticker": ticker,
                "name": name,
                "symbol": f"{ticker}.NS",
                "score": score,
            })

    results.sort(key=lambda x: -x["score"])
    return results[:limit]
