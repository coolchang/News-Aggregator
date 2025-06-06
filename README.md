# News Aggregator

A web application that aggregates and summarizes news articles about digital credentials and open badges.

## Features

- Real-time news aggregation from various sources
- AI-powered article summarization using Hugging Face
- Historical article viewing
- Responsive and modern UI

## Prerequisites

- Node.js (v14 or higher)
- News API key (from [NewsAPI](https://newsapi.org))
- Hugging Face API key (from [Hugging Face](https://huggingface.co))

## Setup

1. Clone the repository:
```bash
git clone https://github.com/coolchang/News-Aggregator.git
cd News-Aggregator
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with your API keys:
```
NEWS_API_KEY=your_news_api_key
HUGGINGFACE_API_KEY=your_huggingface_api_key
```

4. Start the server:
```bash
node server.js
```

5. Open your browser and navigate to `http://localhost:3000`

## Technologies Used

- Node.js
- Express.js
- SQLite
- NewsAPI
- Hugging Face API
- HTML/CSS/JavaScript

## License

MIT License 