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
        if (!article || !article.title) return false;
        
        const content = (article.title + ' ' + (article.description || '') + ' ' + (article.content || '')).toLowerCase();
        const keywords = [
            'digital credential',
            'digital credentials',
            'open badge',
            'open badges',
            'micro-credential',
            'micro-credentials'
        ];
        
        return keywords.some(keyword => content.includes(keyword));
    });
};

// 뉴스 API 호출 함수
const fetchNewsFromAPI = async () => {
    if (!config.newsApiKey) {
        throw new Error('NEWS_API_KEY is not set in environment variables');
    }

    // 검색어를 더 간단하게 수정
    const query = 'digital credential OR open badge OR micro-credential';
    const url = `${config.newsApiUrl}?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=${config.pageSize}`;
    
    console.log('Fetching news from:', url);
    
    try {
        const response = await axios.get(url, {
            headers: {
                'X-Api-Key': config.newsApiKey,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9',
                'Origin': 'https://newsapi.org',
                'Referer': 'https://newsapi.org/',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            timeout: 10000, // 10초 타임아웃
            validateStatus: function (status) {
                return status >= 200 && status < 300; // 2xx 상태 코드만 성공으로 처리
            }
        });

        if (!response.data || !response.data.articles) {
            throw new Error('Invalid response from News API');
        }

        return response.data;
    } catch (error) {
        console.error('News API Error:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data
        });
        
        if (error.response?.status === 403) {
            throw new Error('Access to News API was blocked. Please try again later.');
        }
        
        throw error;
    }
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
        
        // 클라이언트에 더 자세한 에러 메시지 전달
        const errorResponse = {
            error: 'Failed to fetch news',
            details: error.message,
            status: error.response?.status || 500
        };

        res.status(error.response?.status || 500).json(errorResponse);
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