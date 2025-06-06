const fetch = require('node-fetch');
const cheerio = require('cheerio');

class LLMService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.modelUrl = "https://api-inference.huggingface.co/models/facebook/bart-large-cnn";
  }

  async analyzeNews(articles) {
    try {
      // 기사 내용 크롤링
      const articlesWithContent = await Promise.all(
        articles.map(async (article) => {
          try {
            const content = await this.crawlArticleContent(article.url);
            return { ...article, content };
          } catch (error) {
            console.error(`Failed to crawl article: ${article.url}`, error);
            return article;
          }
        })
      );

      // API 키가 없는 경우 기본 요약 제공
      if (!this.apiKey) {
        console.warn('No API key provided, using basic summary');
        return this.generateBasicSummary(articlesWithContent);
      }

      // 각 기사를 개별적으로 요약
      const summarizedArticles = await Promise.all(
        articlesWithContent.map(async (article) => {
          const text = article.content || article.description || '';
          if (!text) return article;

          try {
            const response = await fetch(this.modelUrl, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                inputs: text,
                parameters: {
                  max_length: 150,
                  min_length: 30,
                  do_sample: false
                }
              }),
            });

            if (!response.ok) {
              console.warn(`Failed to summarize article: ${article.title}`);
              return article;
            }

            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
              const summary = data[0].summary_text || data[0].generated_text;
              if (summary) {
                return { ...article, summary };
              }
            }
            return article;
          } catch (error) {
            console.error(`Error summarizing article: ${article.title}`, error);
            return article;
          }
        })
      );

      // 요약된 기사들을 하나의 텍스트로 결합
      const summaryText = summarizedArticles
        .filter(article => article.summary)
        .map(article => `Title: ${article.title}\nSummary: ${article.summary}\n\n`)
        .join('');

      if (!summaryText) {
        console.warn('No summaries generated, using basic summary');
        return this.generateBasicSummary(articlesWithContent);
      }

      // 최종 요약 생성
      try {
        const finalResponse = await fetch(this.modelUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputs: summaryText,
            parameters: {
              max_length: 500,
              min_length: 100,
              do_sample: false
            }
          }),
        });

        if (!finalResponse.ok) {
          console.warn('Failed to generate final summary');
          return this.generateBasicSummary(articlesWithContent);
        }

        const finalData = await finalResponse.json();
        if (Array.isArray(finalData) && finalData.length > 0) {
          const finalSummary = finalData[0].summary_text || finalData[0].generated_text;
          if (finalSummary) {
            return { summary: finalSummary };
          }
        }
      } catch (error) {
        console.error('Error generating final summary:', error);
      }

      return this.generateBasicSummary(articlesWithContent);
    } catch (error) {
      console.error('LLM Analysis Error:', error);
      return this.generateBasicSummary(articles);
    }
  }

  async crawlArticleContent(url) {
    try {
      const response = await fetch(url);
      const html = await response.text();
      const $ = cheerio.load(html);

      // 일반적인 기사 본문 선택자들
      const selectors = [
        'article', 
        '.article-content',
        '.article-body',
        '.story-content',
        '.post-content',
        'main',
        '[role="main"]',
        '.content',
        '#content'
      ];

      // 각 선택자로 본문 찾기
      for (const selector of selectors) {
        const content = $(selector).text().trim();
        if (content.length > 100) { // 최소 100자 이상인 경우만 유효한 본문으로 간주
          return this.cleanText(content);
        }
      }

      // 선택자로 찾지 못한 경우, p 태그들을 모아서 본문으로 간주
      const paragraphs = $('p')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(text => text.length > 50) // 최소 50자 이상인 단락만 포함
        .join('\n\n');

      return this.cleanText(paragraphs);
    } catch (error) {
      console.error(`Error crawling article: ${url}`, error);
      return null;
    }
  }

  cleanText(text) {
    return text
      .replace(/\s+/g, ' ') // 여러 공백을 하나로
      .replace(/\n+/g, '\n') // 여러 줄바꿈을 하나로
      .trim();
  }

  generateBasicSummary(articles) {
    const sources = new Set(articles.map(article => article.source.name));
    const totalArticles = articles.length;
    const uniqueSources = sources.size;

    // 주요 키워드 추출 (제목과 본문에서)
    const keywords = this.extractKeywords(articles);
    
    // 최신 기사 5개 추출 (3개에서 5개로 증가)
    const recentArticles = articles
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .slice(0, 5);

    // 주요 언론사 추출 (기사 수 기준)
    const sourceCounts = {};
    articles.forEach(article => {
      sourceCounts[article.source.name] = (sourceCounts[article.source.name] || 0) + 1;
    });
    const topSources = Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5) // 3개에서 5개로 증가
      .map(([name, count]) => `${name}(${count}건)`);

    // 본문이 있는 기사들의 주요 내용 요약
    const articlesWithContent = articles.filter(article => article.content);
    const contentSummary = articlesWithContent.length > 0
      ? `\n\n주요 기사 내용:\n${articlesWithContent
          .slice(0, 5) // 3개에서 5개로 증가
          .map(article => {
            const date = new Date(article.publishedAt).toLocaleDateString('ko-KR');
            return `- ${article.title} (${article.source.name}, ${date}):\n  ${article.content.substring(0, 300)}...`;
          })
          .join('\n\n')}`
      : '';

    // 기사 발행일 분석
    const dates = articles.map(article => new Date(article.publishedAt));
    const earliestDate = new Date(Math.min(...dates));
    const latestDate = new Date(Math.max(...dates));
    const dateRange = `\n\n기사 발행 기간: ${earliestDate.toLocaleDateString('ko-KR')} ~ ${latestDate.toLocaleDateString('ko-KR')}`;

    // 주제별 기사 수 분석
    const topicAnalysis = this.analyzeTopics(articles);
    const topicSummary = `\n\n주제별 기사 분포:\n${topicAnalysis.map(topic => 
      `- ${topic.name}: ${topic.count}건 (${((topic.count / totalArticles) * 100).toFixed(1)}%)`
    ).join('\n')}`;

    const summary = `이번 뉴스 모음에서는 ${totalArticles}개의 관련 기사를 수집했습니다. ` +
      `${uniqueSources}개의 다양한 언론사에서 보도했으며, 주요 주제는 ${keywords.join(', ')}입니다.\n\n` +
      `주요 언론사로는 ${topSources.join(', ')} 등이 있으며, ` +
      `최근 주요 보도로는:\n${recentArticles.map(article => 
        `- "${article.title}" (${article.source.name}, ${new Date(article.publishedAt).toLocaleDateString('ko-KR')})`
      ).join('\n')} 등이 있습니다.` +
      dateRange +
      topicSummary +
      contentSummary;

    return { summary };
  }

  extractKeywords(articles) {
    // 제목과 본문에서 주요 키워드 추출
    const allText = articles
      .map(article => {
        const text = article.content 
          ? `${article.title} ${article.content}`
          : article.title;
        return text.toLowerCase().split(/\s+/);
      })
      .flat();

    // 불용어 제거
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must'
    ]);
    
    const filteredWords = allText.filter(word => 
      word.length > 3 && !stopWords.has(word)
    );

    // 단어 빈도수 계산
    const wordFreq = {};
    filteredWords.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    // 상위 5개 키워드 반환
    return Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  analyzeTopics(articles) {
    // 주제 키워드 정의
    const topicKeywords = {
      '디지털 크리덴셜': ['digital credential', 'credential', 'certificate', 'certification'],
      '오픈배지': ['open badge', 'badge', 'micro-credential'],
      '블록체인': ['blockchain', 'web3', 'nft', 'token'],
      '교육': ['education', 'learning', 'university', 'school', 'student'],
      '기업': ['company', 'enterprise', 'business', 'corporate'],
      '정책': ['policy', 'government', 'regulation', 'standard']
    };

    // 각 기사의 주제 분석
    const topicCounts = {};
    articles.forEach(article => {
      const text = `${article.title} ${article.content || ''}`.toLowerCase();
      let foundTopic = false;

      for (const [topic, keywords] of Object.entries(topicKeywords)) {
        if (keywords.some(keyword => text.includes(keyword.toLowerCase()))) {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
          foundTopic = true;
        }
      }

      if (!foundTopic) {
        topicCounts['기타'] = (topicCounts['기타'] || 0) + 1;
      }
    });

    // 주제별 통계 정렬
    return Object.entries(topicCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }
}

module.exports = LLMService; 