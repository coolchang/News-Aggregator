require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

// 설정
const config = {
    port: process.env.PORT || 3000,
    gdeltApiUrl: 'https://api.gdeltproject.org/api/v2/doc/doc',
    searchQueries: [
        'digital credential',
        'open badge',
        'micro-credential'
    ],
    pageSize: 100,
    requestDelay: 2000
};

// 유틸리티 함수
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// GDELT API 관련 함수들
const gdeltApi = {
    async fetchArticles(query) {
        const url = `${config.gdeltApiUrl}?query=${encodeURIComponent(query)}&mode=artlist&format=json&maxrecords=${config.pageSize}`;
        console.log('Fetching news from GDELT:', url);

        try {
            await delay(config.requestDelay);
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json'
                },
                timeout: 10000
            });

            if (!response.data?.articles) {
                console.warn(`Invalid response for query "${query}":`, response.data);
                return [];
            }

            return response.data.articles;
        } catch (error) {
            console.error(`GDELT API Error for query "${query}":`, {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                message: error.message
            });
            return [];
        }
    },

    transformArticle(article) {
        return {
            title: article.title || '',
            description: article.seo_description || article.description || '',
            url: article.url || '',
            urlToImage: article.image || '',
            publishedAt: article.seo_date_published || article.date_published || '',
            source: {
                name: article.domain || 'Unknown'
            }
        };
    },

    isValidArticle(article) {
        return !!article.url;
    }
};

// 뉴스 처리 관련 함수들
const newsProcessor = {
    async fetchAllNews() {
        let allArticles = [];

        for (const query of config.searchQueries) {
            const rawArticles = await gdeltApi.fetchArticles(query);
            console.log(`Raw articles count for "${query}": ${rawArticles.length}`);

            const validArticles = rawArticles
                .map(gdeltApi.transformArticle)
                .filter(gdeltApi.isValidArticle);

            console.log(`Valid articles count for "${query}": ${validArticles.length}`);
            allArticles = [...allArticles, ...validArticles];
        }

        return allArticles;
    },

    removeDuplicates(articles) {
        return Array.from(new Map(articles.map(article => [article.url, article])).values());
    },

    sortByDate(articles) {
        return articles.sort((a, b) => {
            const dateA = new Date(a.publishedAt || 0);
            const dateB = new Date(b.publishedAt || 0);
            return dateB - dateA;
        });
    }
};

// Express 앱 설정
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 로깅 미들웨어
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// 라우트 핸들러
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/news', async (req, res) => {
    try {
        const allArticles = await newsProcessor.fetchAllNews();
        console.log(`Total articles before deduplication: ${allArticles.length}`);

        if (allArticles.length === 0) {
            throw new Error('No articles found from any query');
        }

        const uniqueArticles = newsProcessor.removeDuplicates(allArticles);
        console.log(`Total articles after deduplication: ${uniqueArticles.length}`);

        const sortedArticles = newsProcessor.sortByDate(uniqueArticles);
        res.json({ articles: sortedArticles });
    } catch (error) {
        console.error('Error fetching news:', error);
        res.status(500).json({ error: error.message });
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