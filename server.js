require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const LLMService = require('./llm-service');
const dbService = require('./db-service');

const app = express();
const port = process.env.PORT || 3000;

// API 키 설정
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;

// API 키 로깅
console.log('Environment variables loaded:');
console.log('NEWS_API_KEY length:', NEWS_API_KEY ? NEWS_API_KEY.length : 0);
console.log('NEWS_API_KEY first 5 chars:', NEWS_API_KEY ? NEWS_API_KEY.substring(0, 5) + '...' : 'Missing');
console.log('HUGGINGFACE_API_KEY length:', HUGGINGFACE_API_KEY ? HUGGINGFACE_API_KEY.length : 0);
console.log('HUGGINGFACE_API_KEY 5 chars:', HUGGINGFACE_API_KEY ? HUGGINGFACE_API_KEY.substring(0, 5) + '...' : 'Missing');

// 서비스 초기화
const llmService = new LLMService(HUGGINGFACE_API_KEY);

// News API URL
const NEWS_API_URL = 'https://newsapi.org/v2/everything';

// 미들웨어 설정
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname))); // 루트 디렉토리에서 정적 파일 제공

// 루트 경로 처리
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 뉴스 가져오기 API
app.get('/api/news', async (req, res) => {
  try {
    console.log('Making request to News API:');
    const query = '("digital credential" OR "digital credentials" OR "open badge" OR "open badges" OR "micro-credential" OR "micro-credentials")';
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=100`;
    
    console.log('URL:', url);
    console.log('Query:', query);
    console.log('API Key length:', process.env.NEWS_API_KEY.length);

    const response = await axios.get(url, {
      headers: {
        'X-Api-Key': process.env.NEWS_API_KEY
      }
    });

    console.log('News API Response Status:', response.status);
    console.log('Received', response.data.articles.length, 'articles from News API');

    // 필터링 로직 단순화
    const filteredArticles = response.data.articles.filter(article => {
      const content = (article.title + ' ' + (article.description || '') + ' ' + (article.content || '')).toLowerCase();
      return content.includes('digital credential') || 
             content.includes('digital credentials') || 
             content.includes('open badge') || 
             content.includes('open badges') || 
             content.includes('micro-credential') || 
             content.includes('micro-credentials');
    });

    console.log('Filtered down to', filteredArticles.length, 'relevant articles');

    if (filteredArticles.length === 0) {
      console.log('No relevant articles found after filtering');
      return res.json({ articles: [] });
    }

    // 기사 저장 및 AI 분석
    const savedArticles = await Promise.all(
      filteredArticles.map(async (article) => {
        const savedArticle = await dbService.saveArticle(article);
        return savedArticle;
      })
    );

    // AI 분석 수행
    const analysis = await llmService.analyzeNews(savedArticles);

    // 일일 요약 저장
    await dbService.saveDailySummary({
      date: new Date().toISOString().split('T')[0],
      article_count: savedArticles.length,
      source_count: new Set(savedArticles.map(a => a.source_name)).size,
      summary: analysis.summary
    });

    res.json({
      articles: savedArticles,
      analysis: analysis
    });
  } catch (error) {
    console.error('Error fetching news:', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// 과거 기사 조회 API
app.get('/api/news/history/:date', async (req, res) => {
  try {
    console.log('Fetching history for date:', req.params.date);
    const articles = await dbService.getArticlesByDate(req.params.date);
    console.log(`Found ${articles.length} articles for date ${req.params.date}`);
    
    if (!articles || articles.length === 0) {
      return res.json([]);
    }

    res.json(articles);
  } catch (error) {
    console.error('Error in /api/news/history:', error);
    res.status(500).json({ 
      error: 'Failed to fetch historical articles',
      message: error.message 
    });
  }
});

// 주제별 기사 조회 API
app.get('/api/news/topic/:topic', async (req, res) => {
  try {
    const articles = await dbService.getArticlesByTopic(req.params.topic);
    res.json(articles);
  } catch (error) {
    console.error('Error in /api/news/topic:', error);
    res.status(500).json({ 
      error: 'Failed to fetch articles by topic',
      message: error.message 
    });
  }
});

// 키워드 검색 API
app.get('/api/news/search/:keyword', async (req, res) => {
  try {
    const articles = await dbService.searchArticles(req.params.keyword);
    res.json(articles);
  } catch (error) {
    console.error('Error in /api/news/search:', error);
    res.status(500).json({ 
      error: 'Failed to search articles',
      message: error.message 
    });
  }
});

// 통계 API
app.get('/api/news/stats', async (req, res) => {
  try {
    const stats = await dbService.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error in /api/news/stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch stats',
      message: error.message 
    });
  }
});

// 서버 시작
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 