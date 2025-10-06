# 要件定義書

## 1\. アプリ概要

- **目的**  
    
    - 個人の習慣や勉強タスクをカレンダーに時間を決めて管理する．
    - タスクをこなせないとポイントをマイナス，こなせたらプラスし，ランキングを作成．
    - 友人同士の予定共有・相互監視により「共勉強」体験を促進する。
    
- **想定ユーザー**
    
    - 学生（受験・資格勉強中の仲間）
        
    - 社会人の自己研鑽仲間（英語・資格・プログラミング）
        

---

## 2\. コア機能一覧

### (1) マイページ

- 一週間のタスク遂行時間, 遂行割合 棒グラフ
    
- 自分のレベル / ストリーク日数 / 累積経験値
    

### (2) カレンダー画面

- 日付をクリックすると時間ごとのタスクスケジュールを表示
    
- イベント，タスク作成（単発 / 繰り返し）
    
- イベント詳細：タイトル、タグ（勉強/プライベート等）、公開範囲
    
- 友人のカレンダーとの切替
    

### (3) 友人ランキング

- 週間総勉強時間，完遂割合ランキング
    

### (4) タイムライン

- タスク完了/未達成の自動投稿
    
- リアクション（いいね / バッド）
    

---

## 3\. 技術スタック案

### フロントエンド

- **Next.js**
    
    - Tailwind CSS
        

### バックエンド

- **Next.js (App Router)**
    
    - Route Handler / Server Action で REST API を提供
    
- 認証: Auth.js (NextAuth) + Google OAuth
        

### データベース

- **PostgreSQL**
        
- ORM: Prisma
    

### インフラ

- Vercel（フロント/バックエンド一体運用）
    

### リアルタイム

- WebSocket or Supabase Realtime（Postgresの変更通知を流用）
    
- タイムライン更新や友人ランキングの即時反映に利用
    

---

## 4\. データモデル（例）

**users**

- id, name, email, avatar, xp, level, streak\_count
    

**events**

- id, user\_id, title, description, duration, rrule, exdates, visibility
    

**occurrences**

- id, event\_id, start\_at, end\_at, status (scheduled/done/missed)
    

**penalties**

- id, occurrence\_id, type (score\_loss/social\_post), applied\_at
    

**timeline\_posts**

- id, user\_id, occurrence\_id, message, visibility
    

**friendships**

- id, user_a_id, user_b_id, created_at
    

---

## 5\. ページ設計（サイドバー遷移）

- **マイページ**  
    `/mypage` – グラフ（週間タスク遂行時間）、レベル、などの表示
    
- **カレンダー**  
    `/calendar` – 自分/友人切替、日付クリックで予定一覧モーダル
    
- **ランキング**  
    `/ranking` – 週間コミットランキング（総時間、ストリークなど）
    
- **タイムライン**  
    `/timeline` – 友人タスク達成/失敗通知、リアクション
