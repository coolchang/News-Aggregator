require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

// 설정
const config = {
    port: process.env.PORT || 3000,
    gdeltApiUrl: 'https://api.gdeltproject.org/api/v2/doc/doc',
    searchQuery: '(digital credential) OR (open badge) OR (micro-credential)',
    pageSize: 100,
    requestDelay: 2000
};

// 앱 초기화
const app = express();

// 미들웨어 설정
app.use(cors({
    origin: true,
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

// 딜레이 함수
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// GDELT API 호출 함수
const fetchNewsFromGDELT = async () => {
    const url = `${config.gdeltApiUrl}?query=${encodeURIComponent(config.searchQuery)}&mode=artlist&format=json&maxrecords=${config.pageSize}`;
    
    console.log('Fetching news from GDELT:', url);
    
    try {
        // 요청 전 딜레이
        await delay(config.requestDelay);

        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            },
            timeout: 10000
        });

        if (!response.data || !response.data.articles) {
            throw new Error('Invalid response from GDELT API');
        }

        // GDELT 응답을 우리 형식으로 변환
        const articles = response.data.articles.map(article => ({
            title: article.title,
            description: article.seo_description || article.description,
            url: article.url,
            urlToImage: article.image,
            publishedAt: article.seo_date_published || article.date_published,
            source: {
                name: article.domain
            }
        }));

        return { articles };
    } catch (error) {
        console.error('GDELT API Error:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data
        });
        
        throw error;
    }
};

// 필터링 함수
const filterArticles = (articles) => {
    return articles.filter(article => {
        if (!article || !article.title) return false;
        
        const content = (article.title + ' ' + (article.description || '')).toLowerCase();
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

// 라우트 핸들러
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/news', async (req, res) => {
    try {
        const newsData = await fetchNewsFromGDELT();
        console.log(`Received ${newsData.articles.length} articles from GDELT`);

        const filteredArticles = filterArticles(newsData.articles);
        console.log(`Filtered down to ${filteredArticles.length} relevant articles`);

        res.json({
            articles: filteredArticles || [],
            analysis: { summary: 'Analysis temporarily disabled' }
        });
    } catch (error) {
        console.error('Error fetching news:', error);
        
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
}); 