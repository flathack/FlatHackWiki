import { db } from '../../config/database.js';

interface SearchResult {
  type: string;
  id: string;
  title: string;
  excerpt: string;
  space: { key: string; name: string };
  author?: { name: string };
  updatedAt: string;
  score: number;
}

class SearchService {
  async search(query: string, spaceKey?: string, userId?: string): Promise<{ results: SearchResult[]; total: number }> {
    if (!query || query.length < 2) return { results: [], total: 0 };

    const results: SearchResult[] = [];

    // Search pages
    const pages = await db.page.findMany({
      where: {
        deletedAt: null,
        ...(spaceKey ? { space: { key: spaceKey } } : {}),
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { content: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: {
        space: { select: { key: true, name: true } },
        creator: { select: { name: true } },
      },
      take: 20,
    });

    for (const page of pages) {
      let excerpt = page.content || '';
      const queryLower = query.toLowerCase();
      const pos = excerpt.toLowerCase().indexOf(queryLower);
      if (pos >= 0) {
        const start = Math.max(0, pos - 50);
        const end = Math.min(excerpt.length, pos + query.length + 50);
        excerpt = (start > 0 ? '...' : '') + excerpt.substring(start, end) + (end < excerpt.length ? '...' : '');
      } else if (excerpt.length > 100) {
        excerpt = excerpt.substring(0, 100) + '...';
      }

      results.push({
        type: 'page',
        id: page.slug,
        title: page.title,
        excerpt: excerpt.replace(new RegExp(`(${query})`, 'gi'), '<mark>$1</mark>'),
        space: page.space,
        author: page.creator,
        updatedAt: page.updatedAt.toISOString(),
        score: page.title.toLowerCase().includes(query.toLowerCase()) ? 0.9 : 0.7,
      });
    }

    // Search spaces
    if (!spaceKey) {
      const spaces = await db.space.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 10,
      });

      for (const space of spaces) {
        results.push({
          type: 'space',
          id: space.key,
          title: space.name,
          excerpt: space.description || '',
          space: { key: space.key, name: space.name },
          updatedAt: space.createdAt.toISOString(),
          score: space.name.toLowerCase().includes(query.toLowerCase()) ? 0.85 : 0.6,
        });
      }
    }

    return { results, total: results.length };
  }
}

export const searchApi = new SearchService();
