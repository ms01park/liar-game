# Liar Game

Next.js App Router 기반 라이어게임입니다. 1기기 모드는 서버 없이 동작하고, 여러 기기 모드는 Supabase Realtime 또는 localStorage mock 모드로 실행할 수 있습니다.

## 실행

```bash
npm install
npm run dev
```

검증:

```bash
npm run lint
npm run build
```

## 환경 변수

`.env.local.example`을 참고해 `.env.local`을 만듭니다.

local mock 모드:

```env
NEXT_PUBLIC_USE_LOCAL_MOCK=true
NEXT_PUBLIC_APP_URL=http://192.168.0.101:3000
```

Supabase 모드:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
NEXT_PUBLIC_USE_LOCAL_MOCK=false
NEXT_PUBLIC_APP_URL=http://192.168.0.101:3000
```

`SUPABASE_SERVICE_ROLE_KEY`는 서버 API에서만 사용합니다. 브라우저 코드에는 노출하지 않습니다.

`NEXT_PUBLIC_APP_URL`은 QR 코드, 복사 링크, 공유 링크의 기준 주소입니다. 로컬 모바일 테스트에서는 PC의 네트워크 IP 주소를 넣습니다. 배포 후에는 실제 배포 주소를 넣습니다.

예:

```env
NEXT_PUBLIC_APP_URL=http://192.168.0.101:3000
NEXT_PUBLIC_APP_URL=https://liar-game.vercel.app
```

## Supabase 설정

1. Supabase 프로젝트를 만듭니다.
2. SQL Editor에서 [supabase/schema.sql](./supabase/schema.sql)을 실행합니다.
3. Database > Replication 또는 Realtime 설정에서 `rooms`, `players`, `messages`, `time_adjustments` 테이블이 Realtime publication에 포함되어 있는지 확인합니다.
4. `.env.local`에 URL, anon key, service role key를 넣고 `NEXT_PUBLIC_USE_LOCAL_MOCK=false`로 설정합니다.
5. 로컬 모바일 테스트를 한다면 `NEXT_PUBLIC_APP_URL`에 PC의 네트워크 IP 주소를 넣습니다.
6. dev 서버를 재시작합니다.

기존 DB가 있으면 같은 schema 파일을 다시 실행해도 필요한 컬럼, 인덱스, 권한을 추가하도록 구성되어 있습니다.

## 모드

- 1기기 모드: `/single`, Supabase와 무관하게 동작합니다.
- 여러 기기 local mock: `NEXT_PUBLIC_USE_LOCAL_MOCK=true`, 브라우저 localStorage에 방/플레이어/진행 상태를 저장합니다.
- 여러 기기 Supabase: `NEXT_PUBLIC_USE_LOCAL_MOCK=false`, API route가 Supabase service role client로 DB를 갱신하고 브라우저는 Supabase Realtime으로 변경을 구독합니다.

## 여러 기기 테스트

local mock:

1. `.env.local`에 `NEXT_PUBLIC_USE_LOCAL_MOCK=true`를 둡니다.
2. `NEXT_PUBLIC_APP_URL=http://PC_IP:3000`을 설정합니다.
3. `npm run dev`를 실행합니다.
4. `/rooms/new`에서 방을 만들고 QR 또는 링크로 접속합니다.

Supabase:

1. `.env.local`에 Supabase 키와 `NEXT_PUBLIC_USE_LOCAL_MOCK=false`를 둡니다.
2. `NEXT_PUBLIC_APP_URL=http://PC_IP:3000`을 설정합니다.
3. `npm run dev`를 재시작합니다.
4. 같은 Wi-Fi의 휴대폰에서 QR을 찍어 참가 화면이 열리는지 확인합니다.
5. 방 생성, QR/링크 공유, 방 참가, 대기실, 카테고리 투표, 키워드 확인, 설명, 토론/투표, 결과 화면을 확인합니다.

## 배포

Vercel 등에 배포할 때는 아래 환경 변수를 Production/Preview 환경에 모두 등록합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_USE_LOCAL_MOCK=false
NEXT_PUBLIC_APP_URL=https://liar-game.vercel.app
```

## 문제 해결

- `Supabase 설정이 필요합니다`: Supabase 키 3개가 없거나 `NEXT_PUBLIC_USE_LOCAL_MOCK=true`가 아닙니다. dev 서버를 재시작했는지도 확인하세요.
- QR이 `localhost`로 생성됨: `.env.local`에 `NEXT_PUBLIC_APP_URL=http://PC_IP:3000`을 추가하고 dev 서버를 재시작하세요.
- 방 생성 권한 오류: Supabase SQL Editor에서 `supabase/schema.sql`을 다시 실행해 `service_role` 권한을 적용하세요.
- 방 참가 Realtime 반영이 늦음: 앱은 Realtime 구독과 API refetch를 같이 사용합니다. Supabase Realtime publication에 4개 테이블이 포함되어 있는지 확인하세요.
- 참가자가 남아 있음: 클라이언트 heartbeat가 끊기면 `disconnected`로 표시되고, 나간 플레이어는 `left`가 됩니다. 방장은 대기실에서 제거할 수 있습니다.
- 라이어에게 키워드가 보임: 라이어/스파이모드의 라이어는 `word=null`이고 화면에는 `라이어`만 표시되어야 합니다. 바보모드에서만 특수 역할이 시민처럼 위장됩니다.
