/**
 * Fetches public repository and language data from GitHub for a given user.
 * @param {string} username - GitHub username
 * @returns {Promise<{ repos: Array<object>, languages: Array<string>, summary: string }>}
 */
export async function fetchGitHubProfile(username) {
  if (!username || typeof username !== 'string' || !username.trim()) {
    return { repos: [], languages: [], summary: 'No GitHub username provided.' };
  }

  const cleanUsername = username.trim().replace(/^@/, '');
  const url = `https://api.github.com/users/${encodeURIComponent(cleanUsername)}/repos?sort=updated&per_page=20`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FindMyScholarshipAI-Backend',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`[GitHub] User "${cleanUsername}" not found.`);
        return { repos: [], languages: [], summary: `User "${cleanUsername}" not found on GitHub.` };
      }
      if (response.status === 403) {
        console.warn(`[GitHub] Rate limit or forbidden access for "${cleanUsername}".`);
        return { repos: [], languages: [], summary: `GitHub API rate limit reached or access forbidden.` };
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const reposData = await response.json();
    if (!Array.isArray(reposData)) {
      return { repos: [], languages: [], summary: 'No repositories found.' };
    }

    const languagesSet = new Set();
    const repos = reposData
      .filter(repo => !repo.fork) // prioritize original projects
      .map(repo => {
        if (repo.language) languagesSet.add(repo.language);
        return {
          name: repo.name,
          description: repo.description || 'No description',
          language: repo.language || 'Unknown',
          stars: repo.stargazers_count || 0,
          url: repo.html_url,
          topics: repo.topics || []
        };
      })
      .slice(0, 10); // keep top 10 relevant repos

    const languages = Array.from(languagesSet);
    const summary = `Found ${repos.length} public repos. Primary languages: ${languages.join(', ') || 'None stated'}.`;

    return { repos, languages, summary };
  } catch (error) {
    console.error(`[GitHub] Error fetching profile for ${cleanUsername}:`, error.message);
    return { repos: [], languages: [], summary: `Could not fetch GitHub data: ${error.message}` };
  }
}
