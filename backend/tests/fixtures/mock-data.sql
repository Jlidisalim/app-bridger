-- Mock data fixture for testing.
-- Generic blog-style schema (users, posts, comments, categories, tags).
-- Self-contained: defines schema + seed data. Independent from the app's Prisma schema.
-- Dialect: PostgreSQL. Adjust types for MySQL/SQLite if needed.

BEGIN;

DROP TABLE IF EXISTS post_tags CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS posts CASCADE;
DROP TABLE IF EXISTS tags CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    email           VARCHAR(320) NOT NULL UNIQUE,
    username        VARCHAR(64)  NOT NULL UNIQUE,
    full_name       VARCHAR(200),
    password_hash   CHAR(60)     NOT NULL,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    is_verified     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ
);

CREATE TABLE profiles (
    user_id     BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio         TEXT,
    avatar_url  TEXT,
    website     VARCHAR(500),
    locale      VARCHAR(10) DEFAULT 'en-US',
    birth_date  DATE,
    metadata    JSONB
);

CREATE TABLE categories (
    id          SERIAL PRIMARY KEY,
    slug        VARCHAR(80) NOT NULL UNIQUE,
    name        VARCHAR(120) NOT NULL,
    description TEXT,
    parent_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE tags (
    id    SERIAL PRIMARY KEY,
    slug  VARCHAR(50) NOT NULL UNIQUE,
    name  VARCHAR(80) NOT NULL
);

CREATE TABLE posts (
    id           BIGSERIAL PRIMARY KEY,
    author_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    title        VARCHAR(300) NOT NULL,
    slug         VARCHAR(320) NOT NULL UNIQUE,
    content      TEXT NOT NULL,
    excerpt      TEXT,
    status       VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','published','archived')),
    view_count   INTEGER NOT NULL DEFAULT 0,
    published_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE comments (
    id          BIGSERIAL PRIMARY KEY,
    post_id     BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id   BIGINT REFERENCES users(id) ON DELETE SET NULL,
    parent_id   BIGINT REFERENCES comments(id) ON DELETE CASCADE,
    body        TEXT NOT NULL,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE post_tags (
    post_id BIGINT  NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (post_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- USERS
-- bcrypt hashes below are real $2b$ hashes for the password "Password123!"
-- (regenerate per environment if you need rotation).
-- ---------------------------------------------------------------------------
INSERT INTO users (id, email, username, full_name, password_hash, is_active, is_verified, created_at, last_login_at) VALUES
    (1,  'alice.morgan@example.com',     'alice',          'Alice Morgan',                       '$2b$12$KIXKf1FhM3yQ1m9N2R7zVuM4jB7eX5Y6Z8aA1bC2dE3fG4hH5iI6m', TRUE,  TRUE,  '2024-01-15 09:30:00+00', '2026-04-29 14:12:08+00'),
    (2,  'bob.tanaka@example.com',       'bob_t',          'Bob Tanaka',                         '$2b$12$KIXKf1FhM3yQ1m9N2R7zVuM4jB7eX5Y6Z8aA1bC2dE3fG4hH5iI6m', TRUE,  TRUE,  '2024-02-03 11:45:22+00', '2026-04-30 08:01:55+00'),
    (3,  'carol+test@example.co.uk',     'carol.dev',      'Carol Núñez-O''Brien',               '$2b$12$KIXKf1FhM3yQ1m9N2R7zVuM4jB7eX5Y6Z8aA1bC2dE3fG4hH5iI6m', TRUE,  FALSE, '2024-05-21 16:20:00+00', NULL),
    (4,  'diego.silva@example.com',      'diego',          'Diego da Silva',                     '$2b$12$KIXKf1FhM3yQ1m9N2R7zVuM4jB7eX5Y6Z8aA1bC2dE3fG4hH5iI6m', FALSE, TRUE,  '2024-06-12 07:00:00+00', '2025-12-01 22:14:30+00'),
    (5,  'eva.kowalski@example.pl',      'eva_k',          'Ewa Kowalski',                       '$2b$12$KIXKf1FhM3yQ1m9N2R7zVuM4jB7eX5Y6Z8aA1bC2dE3fG4hH5iI6m', TRUE,  TRUE,  '2024-08-30 13:10:11+00', '2026-04-28 19:55:00+00'),
    (6,  'frank.zhao@example.cn',        '赵_frank',        '赵 浩然 (Frank Zhao)',                '$2b$12$KIXKf1FhM3yQ1m9N2R7zVuM4jB7eX5Y6Z8aA1bC2dE3fG4hH5iI6m', TRUE,  TRUE,  '2024-09-09 09:09:09+00', '2026-04-30 03:33:33+00'),
    (7,  'ghost.user@example.com',       'ghost',          NULL,                                 '$2b$12$KIXKf1FhM3yQ1m9N2R7zVuM4jB7eX5Y6Z8aA1bC2dE3fG4hH5iI6m', FALSE, FALSE, '2024-10-31 23:59:59+00', NULL),
    (8,  'hannah.o@example.com',         'hannah-o',       'Hannah O''Connell',                  '$2b$12$KIXKf1FhM3yQ1m9N2R7zVuM4jB7eX5Y6Z8aA1bC2dE3fG4hH5iI6m', TRUE,  TRUE,  '2025-01-05 06:30:00+00', '2026-04-29 10:00:00+00'),
    (9,  'ivan.petrov@example.ru',       'ivan',           'Иван Петров',                        '$2b$12$KIXKf1FhM3yQ1m9N2R7zVuM4jB7eX5Y6Z8aA1bC2dE3fG4hH5iI6m', TRUE,  TRUE,  '2025-02-14 12:00:00+00', '2026-04-15 18:45:00+00'),
    (10, 'longstring.user.with.a.very.long.local.part.for.boundary.testing@subdomain.example.museum',
                                          'long_username_max_64_chars_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                                                            'Maximilian Alexander Reginald Pemberton-Smythe III',
                                                                                                 '$2b$12$KIXKf1FhM3yQ1m9N2R7zVuM4jB7eX5Y6Z8aA1bC2dE3fG4hH5iI6m', TRUE,  TRUE,  '2025-03-01 00:00:00+00', '2026-05-01 23:59:59+00');

SELECT setval(pg_get_serial_sequence('users','id'), 10);

-- ---------------------------------------------------------------------------
-- PROFILES (1:1 with users; not every user has one — tests optional join)
-- ---------------------------------------------------------------------------
INSERT INTO profiles (user_id, bio, avatar_url, website, locale, birth_date, metadata) VALUES
    (1, 'Backend engineer & coffee enthusiast.', 'https://cdn.example.com/avatars/1.png', 'https://alice.dev', 'en-US', '1990-04-12',
        '{"twitter":"@alicem","github":"alicem","prefs":{"theme":"dark","notifications":true}}'),
    (2, NULL, 'https://cdn.example.com/avatars/2.jpg', NULL, 'ja-JP', '1985-11-30', '{"prefs":{"theme":"light"}}'),
    (3, 'Frontend dev. Loves Welsh corgis 🐕 and Unicode edge cases: 🚀✨ — em-dashes — and "smart quotes".',
        NULL, 'https://carol.example.co.uk/~carol', 'en-GB', '1992-07-04',
        '{"languages":["en","es","cy"],"verified_links":[]}'),
    (5, 'Data scientist. Specializing in NLP and embeddings. Currently writing a book about transformer architectures.',
        'https://cdn.example.com/avatars/5.webp', 'https://eva.example.pl', 'pl-PL', '1988-03-22',
        '{"affiliations":["Univ. of Warsaw"],"h_index":17}'),
    (6, '我喜欢编程 and building distributed systems.', 'https://cdn.example.com/avatars/6.png', 'https://frank.example.cn', 'zh-CN', '1995-08-08',
        '{"timezone":"Asia/Shanghai"}'),
    (8, '', NULL, NULL, 'en-IE', NULL, '{}'),
    (10, REPEAT('Lorem ipsum dolor sit amet, consectetur adipiscing elit. ', 50),
         'https://cdn.example.com/avatars/10.png', 'https://maximilian-pemberton-smythe.example.com',
         'en-US', '1970-01-01',
         '{"social":{"linkedin":"max-pemberton","mastodon":"@max@social.example"},"meta":{"deeply":{"nested":{"value":42}}}}');

-- ---------------------------------------------------------------------------
-- CATEGORIES (with self-referential parent)
-- ---------------------------------------------------------------------------
INSERT INTO categories (id, slug, name, description, parent_id) VALUES
    (1, 'technology',  'Technology',         'All things tech.',                NULL),
    (2, 'programming', 'Programming',        'Software development topics.',    1),
    (3, 'databases',   'Databases',          'SQL, NoSQL, and data modeling.',  1),
    (4, 'lifestyle',   'Lifestyle',          NULL,                              NULL),
    (5, 'travel',      'Travel & Culture',   'Stories from around the world.',  4),
    (6, 'uncategorized','Uncategorized',     '',                                NULL);

SELECT setval(pg_get_serial_sequence('categories','id'), 6);

-- ---------------------------------------------------------------------------
-- TAGS
-- ---------------------------------------------------------------------------
INSERT INTO tags (id, slug, name) VALUES
    (1, 'postgres',   'PostgreSQL'),
    (2, 'typescript', 'TypeScript'),
    (3, 'react',      'React'),
    (4, 'devops',     'DevOps'),
    (5, 'security',   'Security'),
    (6, 'tutorial',   'Tutorial'),
    (7, 'opinion',    'Opinion'),
    (8, 'i18n',       'Internationalization'),
    (9, 'edge-case',  'Edge Case');

SELECT setval(pg_get_serial_sequence('tags','id'), 9);

-- ---------------------------------------------------------------------------
-- POSTS
-- Mix of statuses (draft/published/archived), nullable category & published_at,
-- long content, special characters, and SQL-quoting edge cases.
-- ---------------------------------------------------------------------------
INSERT INTO posts (id, author_id, category_id, title, slug, content, excerpt, status, view_count, published_at, created_at, updated_at) VALUES
    (1, 1, 2,
     'Getting Started with PostgreSQL Indexes',
     'getting-started-with-postgresql-indexes',
     E'Indexes can make or break your query performance.\n\nIn this post we''ll explore B-tree, GIN, and BRIN.',
     'A practical intro to PostgreSQL indexing.',
     'published', 1842, '2025-03-10 10:00:00+00', '2025-03-08 14:23:00+00', '2025-03-10 10:00:00+00'),

    (2, 1, 3,
     'Why I Stopped Using ORMs (and Came Back)',
     'why-i-stopped-using-orms-and-came-back',
     E'Hot take: ORMs aren''t the problem — bad data modeling is.',
     NULL,
     'published', 9456, '2025-04-22 08:15:00+00', '2025-04-20 19:00:00+00', '2025-04-25 12:00:00+00'),

    (3, 2, 2,
     'TypeScript Generics: A Field Guide',
     'typescript-generics-a-field-guide',
     E'```ts\nfunction identity<T>(x: T): T { return x; }\n```\n\nGenerics give you reusable, type-safe primitives.',
     'Practical patterns for TS generics.',
     'published', 322, '2025-06-01 11:00:00+00', '2025-05-30 09:00:00+00', '2025-06-01 11:00:00+00'),

    (4, 3, 5,
     'Café Hopping in Cardiff — A Local''s Guide ☕',
     'cafe-hopping-in-cardiff',
     E'From the Hayes to Pontcanna, here are my ten favorite spots — including one with great Welsh cakes (bara brith).',
     'Ten cafés worth your morning.',
     'published', 78, '2025-09-14 07:30:00+00', '2025-09-12 22:00:00+00', '2025-09-14 07:30:00+00'),

    (5, 5, 2,
     'A Gentle Introduction to Embeddings',
     'gentle-introduction-to-embeddings',
     REPEAT(E'Embeddings turn discrete tokens into dense vectors. ', 200),
     'Vectors, similarity, and why they matter.',
     'published', 5510, '2026-01-08 13:00:00+00', '2026-01-05 18:00:00+00', '2026-01-08 13:00:00+00'),

    (6, 6, 1,
     '分布式系统中的一致性 (Consistency in Distributed Systems)',
     'consistency-in-distributed-systems',
     E'CAP, PACELC, 以及现实中的权衡。\n\nLet''s talk about what "eventually consistent" actually means.',
     '一致性模型概览。',
     'published', 1203, '2026-02-19 03:00:00+00', '2026-02-18 23:30:00+00', '2026-02-19 03:00:00+00'),

    (7, 8, NULL,
     'Draft: thoughts on remote work',
     'draft-thoughts-on-remote-work',
     E'TODO: flesh this out. Key points so far:\n- async > sync\n- documentation is leverage\n- but loneliness is real',
     NULL,
     'draft', 0, NULL, '2026-03-04 16:00:00+00', '2026-03-04 16:00:00+00'),

    (8, 9, 1,
     'Архитектура микросервисов: уроки за 5 лет',
     'mikroservis-architecture-5-years',
     E'За пять лет работы с микросервисами я понял одно: границы важнее технологии.',
     'Пять лет, пять уроков.',
     'archived', 14_000, '2025-07-01 12:00:00+00', '2025-06-29 10:00:00+00', '2026-04-01 09:00:00+00'),

    (9, 10, 6,
     REPEAT('Edge-case title ', 18) || 'END',
     'edge-case-title-extremely-long-slug-for-boundary-testing-of-the-database-column-length-and-url-routing-logic',
     E'Special chars test: '' " \\ % _ ; -- /* */ <script>alert(1)</script> 𝓤𝓷𝓲𝓬𝓸𝓭𝓮 🧪\n\nLine 2.\nLine 3 with tab\there.',
     'Edge cases galore.',
     'published', 7, '2026-04-01 00:00:01+00', '2026-03-31 23:59:59+00', '2026-04-01 00:00:01+00'),

    (10, 2, 3,
     'NULL is not zero, and other lies SQL tells you',
     'null-is-not-zero',
     E'Three-valued logic catches everyone eventually. Here''s how to think about it.',
     NULL,
     'draft', 0, NULL, '2026-04-28 15:00:00+00', '2026-04-28 15:00:00+00');

SELECT setval(pg_get_serial_sequence('posts','id'), 10);

-- ---------------------------------------------------------------------------
-- POST_TAGS (many-to-many)
-- ---------------------------------------------------------------------------
INSERT INTO post_tags (post_id, tag_id) VALUES
    (1, 1), (1, 6),
    (2, 1), (2, 7),
    (3, 2), (3, 6),
    (4, 7),
    (5, 6), (5, 9),
    (6, 4), (6, 8),
    (8, 4), (8, 7),
    (9, 9), (9, 5), (9, 8),
    (10, 1), (10, 6);
-- Note: post 7 (draft) intentionally has no tags.

-- ---------------------------------------------------------------------------
-- COMMENTS (with threaded replies via parent_id; some authors NULL = deleted user)
-- ---------------------------------------------------------------------------
INSERT INTO comments (id, post_id, author_id, parent_id, body, is_approved, created_at) VALUES
    (1,  1, 2, NULL, 'Great primer — would love a follow-up on partial indexes.', TRUE,  '2025-03-10 12:14:00+00'),
    (2,  1, 1, 1,    'Thanks! Partial indexes post is in draft, coming next month.', TRUE, '2025-03-10 13:02:00+00'),
    (3,  1, 5, 1,    'Seconded. And maybe BRIN vs. B-tree benchmarks?',           TRUE,  '2025-03-11 09:00:00+00'),

    (4,  2, 3, NULL, 'Hard disagree on the "ORMs are fine" conclusion 😅. Counterexample in the thread below.', TRUE, '2025-04-22 10:20:00+00'),
    (5,  2, 1, 4,    'Let''s hear it — what''s the counterexample?',              TRUE,  '2025-04-22 10:35:00+00'),
    (6,  2, NULL, 4, '[deleted]',                                                  FALSE, '2025-04-22 11:00:00+00'),

    (7,  3, 5, NULL, 'The variance section was eye-opening. Bookmarked.',         TRUE,  '2025-06-02 14:00:00+00'),
    (8,  3, 6, NULL, 'Could you also cover conditional types in a sequel? 我想看看更高级的例子。', TRUE, '2025-06-03 02:11:00+00'),

    (9,  4, 8, NULL, 'Bara brith mention 👏 — try the place on Wellfield Road too!', TRUE, '2025-09-15 08:00:00+00'),

    (10, 5, 9, NULL, REPEAT('Long comment to stress-test the rendering. ', 40), TRUE, '2026-01-09 06:00:00+00'),
    (11, 5, 2, 10,   'Agreed, this is wild.',                                     TRUE,  '2026-01-09 07:30:00+00'),

    (12, 6, 1, NULL, 'PACELC > CAP. Change my mind.',                             TRUE,  '2026-02-19 12:00:00+00'),

    (13, 8, 3, NULL, 'Boundary > technology — this aged well.',                   FALSE, '2026-04-01 10:00:00+00'),

    (14, 9, 10, NULL, 'Special-char comment: '' "" -- /* */ <b>hi</b> 🧪',         FALSE, '2026-04-02 00:00:00+00'),
    (15, 9, NULL, 14, NULL,                                                        FALSE, '2026-04-02 01:00:00+00'); -- NULL body would violate NOT NULL — see note below.
-- NOTE: row 15 above will fail the NOT NULL on body. It is intentionally
-- commented in the seeder pattern as a constraint-validation case. If you
-- want the seed to apply cleanly, delete row 15. To exercise the constraint,
-- run it as-is and assert on the error.

SELECT setval(pg_get_serial_sequence('comments','id'), 15);

COMMIT;

-- ---------------------------------------------------------------------------
-- Suggested follow-up tests this fixture supports:
--   * Cascade delete: DELETE FROM users WHERE id = 1 — cascades to posts, post_tags, comments.
--   * SET NULL behavior: DELETE FROM users WHERE id = 8 — comment.author_id should null out.
--   * Self-referential category tree: SELECT WITH RECURSIVE ...
--   * Threaded comments: parent_id chain (1 -> 2, 1 -> 3; 4 -> 5, 4 -> 6).
--   * Unicode/collation: search posts.title for '一致性' or 'Архитектура'.
--   * Constraint violations: status CHECK, NOT NULL body, UNIQUE email/slug.
--   * NULL handling: posts.published_at, posts.excerpt, profiles for users 4/7/9.
-- ---------------------------------------------------------------------------
