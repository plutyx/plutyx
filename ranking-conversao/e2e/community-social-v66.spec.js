import { test, expect } from '@playwright/test';

const BASE = process.env.GCL_E2E_BASE || 'http://127.0.0.1:4173/ranking-site';
const POST_ID = '11111111-1111-4111-8111-111111111111';
const AUTHOR_ID = '22222222-2222-4222-8222-222222222222';
const VIEWER_ID = '33333333-3333-4333-8333-333333333333';

function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error?.message || error)));
  return errors;
}

async function communityFixture(page) {
  const calls = [];
  let reactionCount = 2;
  let saved = false;
  let following = false;
  let followerCount = 7;
  let commentSeq = 1;
  const comments = [{
    id: '44444444-4444-4444-8444-444444444444',
    post_id: POST_ID,
    parent_comment_id: null,
    user_id: AUTHOR_ID,
    display_name: 'Ana CRO',
    community_level: 3,
    body: 'Teste uma headline mais específica.',
    reaction_count: 0,
    viewer_reaction: null,
    created_at: '2026-09-11T15:00:00-03:00'
  }];

  await page.addInitScript(({ viewerId }) => {
    localStorage.setItem('gcl_session_v1', JSON.stringify({
      access_token: 'gcl-community-e2e-token',
      refresh_token: 'gcl-community-e2e-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: viewerId }
    }));
    window.__gclCommunityXss = 0;
  }, { viewerId: VIEWER_ID });

  await page.route('**/functions/v1/gcl-member-api', async route => {
    const body = route.request().postDataJSON() || {};
    calls.push(body);
    let result = null;

    if (body.action === 'dashboard') {
      result = {
        profile: { user_id: VIEWER_ID, display_name: 'Membro Teste', community_level: 2, community_points: 120 },
        access: { ranking: true, community: true },
        community_leaderboard: [], upcoming_events: [], missions: []
      };
    } else if (body.action === 'spaces') {
      result = [{ slug: 'feed', name: 'Feed', description: 'Discussões da liga', space_type: 'discussion' }];
    } else if (body.action === 'feed') {
      result = { posts: [{
        id: POST_ID,
        author_user_id: AUTHOR_ID,
        display_name: 'Ana CRO',
        community_level: 3,
        member_type: 'optimizer',
        post_type: 'discussion',
        body: 'Teste social real da GCL',
        link_url: null,
        reaction_count: reactionCount,
        comment_count: comments.length,
        view_count: 18,
        viewer_reaction: null,
        viewer_saved: saved,
        viewer_follows_author: following,
        author_follower_count: followerCount,
        featured: false,
        normalized_domain: 'example.com',
        created_at: '2026-09-11T14:50:00-03:00'
      }] };
    } else if (body.action === 'react') {
      reactionCount += 1;
      result = { active: true, reaction: body.reaction, count: reactionCount, counts: { useful: reactionCount } };
    } else if (body.action === 'save_post') {
      saved = !saved;
      result = { saved };
    } else if (body.action === 'follow_member') {
      following = !following;
      followerCount += following ? 1 : -1;
      result = { following, followers: followerCount };
    } else if (body.action === 'comments') {
      result = comments;
    } else if (body.action === 'comment') {
      commentSeq += 1;
      const comment = {
        id: `55555555-5555-4555-8555-${String(commentSeq).padStart(12, '0')}`,
        post_id: POST_ID,
        parent_comment_id: body.parent_comment_id || null,
        user_id: VIEWER_ID,
        display_name: 'Membro Teste',
        community_level: 2,
        body: body.body,
        reaction_count: 0,
        viewer_reaction: null,
        created_at: new Date().toISOString()
      };
      comments.push(comment);
      result = comment;
    } else if (body.action === 'comment_react') {
      result = { active: true, reaction: body.reaction, count: 1 };
    } else {
      result = [];
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result }) });
  });

  await page.goto(`${BASE}/community/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.gcl-post').first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.gcl-social-actions').first()).toBeVisible({ timeout: 10000 });
  return { calls, comments };
}

test('community social controls call the production contract and update local state', async ({ page }) => {
  const errors = collectPageErrors(page);
  const { calls } = await communityFixture(page);
  const post = page.locator('.gcl-post').first();

  await post.locator('.gcl-react').click();
  await post.locator('[data-reaction="useful"]').click();
  await expect(post.locator('.gcl-react')).toContainText('Útil');
  await expect(post.locator('.gcl-react em')).toHaveText('3');

  await post.locator('.gcl-save').click();
  await expect(post.locator('.gcl-save')).toContainText('Salvo');

  await post.locator('.gcl-follow').click();
  await expect(post.locator('.gcl-follow')).toContainText('Seguindo');
  await expect(post.locator('.gcl-follow em')).toHaveText('8');

  expect(calls.some(x => x.action === 'react' && x.post_id === POST_ID && x.reaction === 'useful')).toBeTruthy();
  expect(calls.some(x => x.action === 'save_post' && x.post_id === POST_ID)).toBeTruthy();
  expect(calls.some(x => x.action === 'follow_member' && x.user_id === AUTHOR_ID)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('top-level comments and nested replies keep the visible post counter synchronized', async ({ page }) => {
  const errors = collectPageErrors(page);
  await communityFixture(page);
  const post = page.locator('.gcl-post').first();
  const counter = post.locator('.gcl-comments em');
  await expect(counter).toHaveText('1');

  await post.locator('.gcl-comments').click();
  await expect(post.locator('.gcl-comment-panel')).toBeVisible();

  await post.locator('.gcl-comment-compose input').fill('Comentário principal de teste');
  await post.locator('.gcl-comment-compose button').click();
  await expect(counter).toHaveText('2');

  const root = post.locator('.gcl-comment').first();
  await root.locator('.comment-reply').click();
  await root.locator('.gcl-inline-reply input').fill('Resposta aninhada de teste');
  await root.locator('.gcl-inline-reply button').click();

  await expect(post.locator('.gcl-replies')).toContainText('Resposta aninhada de teste');
  await expect(counter).toHaveText('3');
  expect(errors).toEqual([]);
});

test('community makes score separation explicit and escapes hostile user content', async ({ page }) => {
  const errors = collectPageErrors(page);
  await communityFixture(page);
  const post = page.locator('.gcl-post').first();

  await expect(page.getByText('Reputação social não altera o GCL Score.', { exact: true })).toBeVisible();
  await post.locator('.gcl-comments').click();
  await post.locator('.gcl-comment-compose input').fill('<img src=x onerror="window.__gclCommunityXss=1"> contribuição');
  await post.locator('.gcl-comment-compose button').click();

  await expect(post.locator('.gcl-comment-panel')).toContainText('<img src=x onerror="window.__gclCommunityXss=1"> contribuição');
  await expect(post.locator('.gcl-comment-panel img')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__gclCommunityXss)).toBe(0);
  expect(errors).toEqual([]);
});
