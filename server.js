require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

// 설정
const config = {
    port: process.env.PORT || 3000,
    newsApiKey: process.env.NEWS_API_KEY,
    newsApiUrl: 'https://newsapi.org/v2/everything',
    searchQuery: '("digital credential" OR "digital credentials" OR "open badge" OR "open badges" OR "micro-credential" OR "micro-credentials")',
    pageSize: 100
};

// 앱 초기화
const app = express();

// 미들웨어 설정
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// 로깅 미들웨어
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// 유틸리티 함수
const filterArticles = (articles) => {
    return articles.filter(article => {
        const content = (article.title + ' ' + (article.description || '') + ' ' + (article.content || '')).toLowerCase();
        return content.includes('digital credential') || 
               content.includes('digital credentials') || 
               content.includes('open badge') || 
               content.includes('open badges') || 
               content.includes('micro-credential') || 
               content.includes('micro-credentials');
    });
};

// 뉴스 API 호출 함수
const fetchNewsFromAPI = async () => {
    if (!config.newsApiKey) {
        throw new Error('NEWS_API_KEY is not set in environment variables');
    }

    const url = `${config.newsApiUrl}?q=${encodeURIComponent(config.searchQuery)}&language=en&sortBy=publishedAt&pageSize=${config.pageSize}`;
    
    console.log('Fetching news from:', url);
    
    const response = await axios.get(url, {
        headers: {
            'X-Api-Key': config.newsApiKey
        }
    });

    return response.data;
};

// 라우트 핸들러
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/news', async (req, res) => {
    try {
        const newsData = await fetchNewsFromAPI();
        console.log(`Received ${newsData.articles.length} articles from News API`);

        const filteredArticles = filterArticles(newsData.articles);
        console.log(`Filtered down to ${filteredArticles.length} relevant articles`);

        res.json({
            articles: filteredArticles,
            analysis: { summary: 'Analysis temporarily disabled' }
        });
    } catch (error) {
        console.error('Error fetching news:', error);
        res.status(500).json({ 
            error: 'Failed to fetch news',
            details: error.message
        });
    }
});

// 에러 핸들링 미들웨어
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 서버 시작
app.listen(config.port, () => {
    console.log(`Server is running on port ${config.port}`);
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('News API Key:', config.newsApiKey ? 'Configured' : 'Missing');
}); 