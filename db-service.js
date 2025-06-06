const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DatabaseService {
  constructor() {
    this.db = new sqlite3.Database(path.join(__dirname, 'news.db'));
    this.initDatabase();
  }

  initDatabase() {
    this.db.serialize(() => {
      // 기사 테이블
      this.db.run(`
        CREATE TABLE IF NOT EXISTS articles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT,
          content TEXT,
          url TEXT UNIQUE NOT NULL,
          source_name TEXT,
          published_at TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 일일 요약 테이블
      this.db.run(`
        CREATE TABLE IF NOT EXISTS daily_summaries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT UNIQUE NOT NULL,
          article_count INTEGER DEFAULT 0,
          source_count INTEGER DEFAULT 0,
          summary TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
    });
  }

  async saveArticle(article) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO articles (
          title, description, content, url, source_name, published_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        article.title,
        article.description,
        article.content,
        article.url,
        article.source?.name,
        article.publishedAt,
        (err) => {
          if (err) {
            console.error('Error saving article:', err);
            reject(err);
            return;
          }
          resolve(article);
        }
      );
      stmt.finalize();
    });
  }

  async saveDailySummary(summary) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO daily_summaries (
          date, article_count, source_count, summary
        ) VALUES (?, ?, ?, ?)
      `);

      stmt.run(
        summary.date,
        summary.article_count,
        summary.source_count,
        summary.summary,
        (err) => {
          if (err) {
            console.error('Error saving daily summary:', err);
            reject(err);
            return;
          }
          resolve(summary);
        }
      );
      stmt.finalize();
    });
  }

  async getArticlesByDate(date) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM articles WHERE date(published_at) = date(?) ORDER BY published_at DESC',
        [date],
        (err, rows) => {
          if (err) {
            console.error('Error getting articles:', err);
            reject(err);
            return;
          }
          resolve(rows);
        }
      );
    });
  }

  async getDailySummary(date) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM daily_summaries WHERE date = ?',
        [date],
        (err, row) => {
          if (err) {
            console.error('Error getting daily summary:', err);
            reject(err);
            return;
          }
          resolve(row);
        }
      );
    });
  }

  async getArticlesByTopic(topic) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM articles WHERE title LIKE ? OR description LIKE ? OR content LIKE ? ORDER BY published_at DESC',
        [`%${topic}%`, `%${topic}%`, `%${topic}%`],
        (err, rows) => {
          if (err) {
            console.error('Error getting articles by topic:', err);
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  async searchArticles(keyword) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM articles WHERE title LIKE ? OR description LIKE ? OR content LIKE ? ORDER BY published_at DESC',
        [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`],
        (err, rows) => {
          if (err) {
            console.error('Error searching articles:', err);
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  async getStats() {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT 
          COUNT(*) as total_articles,
          COUNT(DISTINCT source_name) as total_sources,
          MIN(published_at) as earliest_article,
          MAX(published_at) as latest_article
        FROM articles`,
        (err, row) => {
          if (err) {
            console.error('Error getting stats:', err);
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }
}

module.exports = new DatabaseService(); 