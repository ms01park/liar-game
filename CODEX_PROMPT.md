# Codex 작업 프롬프트: 커스텀 라이어게임 웹앱 제작

## 목표

술자리/파티용 커스텀 라이어게임 웹앱을 제작한다.

핵심 요구사항:

- 처음 접속 시 `1기기 모드`와 `여러 기기 모드` 중 하나를 선택한다.
- 1기기 모드는 한 대의 모바일 기기를 돌려가며 키워드만 확인하는 모드다.
- 여러 기기 모드는 방장이 방을 만들고, 참가자들이 각자 기기로 접속해서 실시간으로 진행하는 모드다.
- 사용자가 제공한 엑셀 파일에는 `20개 카테고리 × 카테고리당 100개 단어`가 들어 있다.
- 엑셀 파일을 앱 데이터로 변환해 사용한다.
- 기존 HTML mockup은 흐름 참고용이다. 그대로 복붙하지 말고, 더 게임에 적합한 UI/UX로 새롭게 제작한다.

## 기술 스택

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Postgres + Realtime
- Zustand 또는 React Context
- @dnd-kit: 여러 기기 모드 대기실에서 방장용 참가자 순서 드래그앤드롭
- qrcode.react 또는 동등한 QR 라이브러리
- xlsx: 엑셀 단어 데이터 변환용
- ESLint / Prettier

모바일 우선 반응형으로 만든다.

## 프로젝트 초기 세팅

아직 프로젝트가 없다면 새로 만든다.

```bash
npx create-next-app@latest liar-game --ts --tailwind --eslint --app
cd liar-game
npm install @supabase/supabase-js zustand @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities qrcode.react xlsx nanoid clsx
```

환경변수:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY`는 서버에서만 사용하고 클라이언트에 절대 노출하지 않는다.

## 엑셀 데이터 처리

사용자가 제공한 엑셀 파일을 아래 경로에 둔다.

```text
data/liar_game_words.xlsx
```

엑셀 구조가 정확히 고정되어 있지 않을 수 있으므로, 변환 스크립트는 다음 구조를 유연하게 처리해야 한다.

### 허용 구조 A

| 카테고리 | 단어 |
|---|---|
| 음식 | 치킨 |
| 음식 | 피자 |
| 동물 | 강아지 |

### 허용 구조 B

각 시트명이 카테고리이고, 각 시트 안에 단어가 세로로 있음.

### 허용 구조 C

첫 행에 카테고리명이 있고, 각 열 아래에 단어가 있음.

변환 결과:

```text
src/data/wordPacks.ts
```

형식:

```ts
export type WordPack = {
  category: string;
  words: string[];
};

export const wordPacks: WordPack[] = [
  {
    category: "음식",
    words: ["치킨", "피자"]
  }
];
```

검증 조건:

- 카테고리 수는 20개여야 한다.
- 각 카테고리 단어는 100개여야 한다.
- 중복 단어는 경고를 출력한다.
- 빈 단어는 제거한다.
- 변환 결과가 기준에 맞지 않으면 build 전에 알 수 있게 에러를 낸다.

## 공통 게임 모드

### 일반 라이어 모드

- 시민은 시민 키워드를 본다.
- 라이어는 본인이 라이어임을 알고 라이어 키워드를 본다.
- 결과 화면에서는 시민 키워드와 라이어 키워드를 모두 공개한다.

### 바보모드

- 바보는 다른 키워드를 받는다.
- 바보 본인은 자신이 바보인지 모른다.
- 화면에는 시민처럼 보여야 한다.
- 결과 화면에서는 바보 역할과 실제 키워드를 공개한다.

### 스파이모드

- 라이어는 라이어 키워드를 본다.
- 스파이는 본인이 스파이임을 알고, 시민과 같은 키워드를 본다.
- 스파이는 라이어에게 시민 키워드를 알려줄 수 있는 조력자다.
- 스파이모드가 아닐 때 결과 화면에는 스파이 항목을 표시하지 않는다.

# 1기기 모드

## 핵심 방향

1기기 모드는 오프라인 술자리용이다.

앱 안에서는 토론, 투표, 결과 공개를 하지 않는다. 참가자들이 한 대의 모바일 기기를 돌려가며 키워드만 확인한다.

## 1기기 모드 설정

닉네임은 입력하지 않는다.

필요 설정:

- 참가자 수
- 게임 모드: 라이어 / 바보 / 스파이
- 라이어 수: 1명 이상, 참가자 수보다 작아야 함
- 스파이 수: 스파이모드일 때만 표시
- 카테고리: 20개 카테고리, 반드시 `2 × 10` 배열로 표시
- 키워드 선택: 선택된 카테고리 안에서 시민 키워드와 라이어/바보 키워드를 랜덤으로 뽑고, 두 단어는 서로 달라야 한다.

## 1기기 모드 흐름

```text
시작 화면
↓
1기기 모드 선택
↓
참가자 수 / 모드 / 라이어 수 / 카테고리 설정
↓
1번째 참가자 안내 화면
↓
키워드 확인
↓
확인 완료
↓
2번째 참가자 안내 화면
↓
반복
↓
모든 참가자가 확인 완료
↓
카테고리 선택 화면으로 복귀
```

## 1기기 모드 화면 규칙

안내 화면:

```text
1번째 참가자 차례입니다.
다른 사람이 보지 않게 하세요.
```

키워드 화면:

- 시민: 키워드 표시
- 라이어: 라이어 표시 + 라이어 키워드
- 바보: 시민처럼 표시 + 다른 키워드
- 스파이: 스파이 표시 + 시민 키워드

모든 참가자가 확인하면 결과를 공개하지 않고 카테고리 선택으로 돌아간다.

# 여러 기기 모드

## 전체 흐름

```text
시작 화면
↓
여러 기기 모드 선택
↓
방 만들기 / 방 참가하기
↓
방장이 방 이름과 비밀번호만 설정
↓
방 링크 / QR 코드 표시
↓
참가자 입장
↓
대기실
↓
방장이 게임 설정
↓
방장이 참가자 순서 드래그앤드롭 조정 가능
↓
참가자 준비 완료
↓
카테고리 투표
↓
카테고리 결정
↓
3초 후 자동 역할 배정 및 키워드 확인
↓
키워드 설명 단계
↓
토론 / 채팅 / 투표
↓
결과 공개
```

## 방 생성

방장이 처음 방을 만들 때 설정할 수 있는 것은 아래 두 가지뿐이다.

- 방 이름
- 방 비밀번호

방을 만들면 아래를 표시한다.

- 방 코드
- QR 코드
- QR 이미지 복사
- QR 공유
- 단축 링크 복사

게임 설정은 방 생성 이후 대기실에서 한다.

## 방 참가

참가자는 아래 정보를 입력한다.

- 방 코드
- 방 비밀번호
- 닉네임

참가 후 대기실로 이동한다.

## 대기실

대기실에는 다음을 표시한다.

- 방 이름
- 방 코드
- 현재 참가자 목록
- 준비 완료 상태
- 채팅
- 방장 전용 게임 설정

방장 전용 게임 설정:

- 게임 모드: 라이어 / 바보 / 스파이
- 라이어 수
- 스파이 수: 스파이모드일 때만
- 최대 인원
- 키워드 확인 시간: 최소 5초, 최대 60초, 5초 단위
- 토론 시간
- 참가자 순서 변경

## 참가자 순서 변경

방장은 참가자 명단 우측의 드래그 핸들을 잡고 참가자 순서를 바꿀 수 있어야 한다.

드래그 핸들은 세 줄 모양 아이콘으로 표시한다.

```text
≡
```

구현은 `@dnd-kit`을 사용한다.

주의:

- 순서 변경은 배열 index가 아니라 `player.id` 기준으로 처리한다.
- 순서 변경 후에도 각 기기는 자기 `player.id`를 유지해야 한다.
- 특정 플레이어가 1번에서 4번으로 이동해도, 그 플레이어의 신원과 키워드가 바뀌면 안 된다.
- 이 순서는 이후 키워드 설명 단계의 대기열 순서로 사용한다.

## 카테고리 투표

모든 참가자가 준비 완료되면 방장이 카테고리 투표를 시작한다.

규칙:

- 제한 시간은 10초 고정
- 카테고리 선택지는 20개 카테고리 + 랜덤
- 카테고리는 `2 × 10` 배열로 표시
- 랜덤은 별도 강조 카드로 표시해도 된다.
- 투표 완료 버튼은 없다.
- 시간이 끝나면 자동으로 결정한다.

미투표자 처리:

- 제한 시간 내 선택하지 못한 사람은 기존에 나온 투표 중 랜덤으로 자동 배정한다.
- 아무도 투표하지 않았다면 랜덤으로 처리한다.

동률 처리:

- 동률이면 동률 후보 중 랜덤으로 최종 카테고리를 정한다.
- 최종 후보가 `랜덤`이면 실제 20개 카테고리 중 랜덤으로 하나를 고른다.

카테고리 결정 후:

- 몇 표가 나왔는지는 보여주지 않는다.
- 최종 카테고리만 보여준다.
- 3초 후 자동으로 역할 배정 및 키워드 확인 단계로 넘어간다.
- 별도 시작 버튼은 없다.

## 역할 및 키워드 배정

카테고리가 결정된 뒤, 선택된 카테고리 안에서 서로 다른 두 단어를 뽑는다.

- 시민 키워드
- 라이어/바보 키워드

역할 배정은 참가자 수와 설정값에 따라 무작위로 처리한다.

조건:

- 라이어 수는 1명 이상
- 라이어 수 + 스파이 수는 참가자 수보다 작아야 한다.
- 방장도 플레이어라면 방장도 랜덤 배정 대상이다.
- 결과 공개 전까지 각 플레이어는 자기 카드만 볼 수 있다.

## 키워드 확인 단계

모든 기기에서 동시에 자기 카드가 공개된다.

- 방장이 설정한 확인 시간 동안만 표시
- 시간이 끝나면 자동 숨김
- mock 버튼 또는 수동 종료 버튼은 만들지 않는다.

플레이어별 표시:

- 시민: 시민 키워드
- 라이어: 라이어 역할 + 라이어 키워드
- 바보: 시민처럼 보임 + 바보 키워드
- 스파이: 스파이 역할 + 시민 키워드

## 키워드 설명 단계

키워드 확인 후 바로 토론으로 가지 않는다.

참가자 대기열 순서대로 각 플레이어가 30초씩 키워드를 설명한다.

화면 상단 정보:

```text
카테고리    내 키워드    남은 시간
```

규칙:

- 현재 설명자만 채팅 입력 가능
- 현재 설명자만 `설명 완료 · 다음 플레이어` 버튼을 누를 수 있음
- 다른 플레이어의 화면에서는 버튼과 입력창이 비활성화됨
- 30초가 지나면 자동으로 다음 플레이어로 넘어감
- 시간이 남아 있어도 현재 설명자가 버튼을 누르면 다음 플레이어로 넘어감
- 모든 플레이어가 설명을 완료하면 토론 단계로 이동

설명 채팅:

- 현재 플레이어의 설명만 보여주는 것이 아니라, 지금까지 모든 플레이어가 작성한 설명을 순서대로 누적 표시한다.

대기열:

- 참가자 순서 표시
- 현재 설명자는 강조
- 현재 설명자 오른쪽에는 남은 초 표시
- 완료된 플레이어는 완료 표시
- 아직 남은 플레이어는 대기 표시

## 토론 / 채팅 / 투표 단계

토론 단계는 하나의 화면에서 진행한다.

상단 정보:

```text
카테고리    내 키워드    남은 시간
```

여기서 키워드는 각 플레이어 기준의 `내 키워드`다.  
라이어에게 시민 키워드를 공개하면 안 된다.

투표 영역:

- 닉네임만 표시
- 가로 배치
- 한 줄 최대 6명
- 6명 이하는 한 줄에 균등 배치
- 7명은 4명 / 3명
- 8명은 4명 / 4명
- 11명은 6명 / 5명
- 그 이상도 최대 6명 기준으로 자동 줄바꿈

채팅 영역:

- 실시간 채팅창을 펼쳐서 표시한다.
- 단순 미리보기 형태가 아니어야 한다.
- 메시지 목록과 입력창이 바로 보여야 한다.

시간 조정:

- 투표 완료 버튼은 없다.
- `15초 단축`
- `15초 연장`
- 두 버튼을 가로로 배치한다.
- 각 플레이어는 단축/연장 중 하나를 라운드당 한 번만 사용할 수 있다.
- 버튼을 누르면 토론 시간이 즉시 15초 단축 또는 15초 연장된다.
- 누가 눌렀는지는 서버 상태에 저장한다.
- 이미 사용한 플레이어의 버튼은 비활성화한다.

투표:

- 플레이어는 토론 중 언제든 닉네임을 눌러 투표할 수 있다.
- 마지막 선택이 저장된다.
- 별도 투표 완료 버튼은 없다.
- 토론 시간이 끝나면 현재 투표 상태로 결과를 계산한다.
- 미투표자는 무효표로 처리한다.

## 결과 공개

결과 화면에는 다음을 표시한다.

- 시민 승리 또는 라이어 승리
- 라이어가 누구였는지
- 카테고리
- 시민 키워드
- 라이어 키워드
- 스파이모드일 때만 스파이 표시
- 스파이모드가 아니면 스파이 항목은 아예 표시하지 않는다.

하단 버튼:

- 같은 방에서 다시 하기
- 처음으로

승패 기본 규칙:

- 최다 득표자가 라이어 중 한 명이면 시민 승리
- 최다 득표자가 라이어가 아니면 라이어 승리
- 동률일 경우:
  - 동률 대상 중 라이어가 포함되어 있으면 시민 승리
  - 아니면 라이어 승리

## Supabase 데이터 모델

아래 스키마를 기본으로 구현한다.

필요 시 더 정규화해도 되지만, 핵심 상태는 유지해야 한다.

```sql
create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  password_hash text not null,
  host_player_id uuid,
  status text not null default 'waiting',
  mode text not null default 'liar',
  max_players int not null default 8,
  liar_count int not null default 1,
  spy_count int not null default 0,
  reveal_seconds int not null default 10,
  talk_seconds int not null default 180,
  selected_category text,
  citizen_word text,
  liar_word text,
  phase text not null default 'lobby',
  phase_started_at timestamptz,
  created_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  nickname text not null,
  session_token text not null,
  is_host boolean not null default false,
  ready boolean not null default false,
  sort_order int not null default 0,
  role text,
  visible_role text,
  word text,
  category_vote text,
  vote_target_id uuid references players(id),
  used_time_adjust boolean not null default false,
  joined_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  phase text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table time_adjustments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  delta_seconds int not null,
  created_at timestamptz not null default now(),
  unique(room_id, player_id)
);
```

실제 구현 시 RLS 정책 또는 서버 액션을 사용해 데이터 조작을 보호한다.

## 라우팅 구조 제안

```text
/
  시작 화면

/single
  1기기 모드 설정 및 진행

/rooms/new
  방 만들기

/rooms/[code]/join
  방 참가

/rooms/[code]
  여러 기기 모드 메인
```

방 내부에서는 phase에 따라 화면을 전환한다.

```ts
type RoomPhase =
  | "lobby"
  | "category_vote"
  | "category_result"
  | "keyword_reveal"
  | "speaking"
  | "discussion"
  | "result";
```

## UI/UX 기준

기존 HTML mockup은 구조 참고용이다.  
최종 디자인은 더 게임답게 제작한다.

디자인 방향:

- 모바일 우선
- 다크 테마
- 큰 버튼
- 터치 영역 넓게
- 카드형 UI
- 게임 진행 단계가 명확하게 보이도록
- 타이머는 크고 직관적으로
- 역할/키워드 화면은 몰래 확인하기 쉽도록 단순하고 강하게
- 참가자 순서 변경은 드래그 핸들로 명확하게
- 채팅과 투표는 한 화면에서 답답하지 않게 배치

필수 접근성:

- 버튼에는 명확한 텍스트
- disabled 상태 시각적으로 구분
- 작은 화면에서도 주요 CTA가 보이도록 배치
- QR/링크 복사 실패 시 fallback 메시지 표시

## 검증 조건

Codex는 작업 완료 후 아래를 모두 확인한다.

```bash
npm run lint
npm run build
```

수동 테스트 시나리오:

### 1기기 모드

- 참가자 수 5명
- 라이어 2명
- 카테고리 2×10 표시 확인
- 각 참가자 키워드 확인
- 모든 참가자 확인 후 카테고리 선택으로 복귀

### 여러 기기 모드

- 방 생성
- QR/링크 표시
- 참가자 입장
- 대기실 게임 설정
- 참가자 순서 드래그앤드롭
- 순서 변경 후에도 player.id가 유지되는지 확인
- 카테고리 투표 10초 자동 종료
- 미투표자 자동 처리
- 카테고리 결정 후 3초 자동 이동
- 키워드 확인 자동 숨김
- 설명 단계에서 현재 플레이어만 채팅/완료 가능
- 설명 채팅 누적 표시
- 토론 화면에서 채팅/투표/15초 단축/연장 가능
- 결과 화면에서 라이어와 라이어 키워드 표시
- 스파이모드가 아니면 스파이 항목 미표시

## 작업 방식

1. 먼저 프로젝트 구조와 타입을 만든다.
2. 엑셀 변환 스크립트를 만든다.
3. 1기기 모드를 완성한다.
4. Supabase schema를 작성한다.
5. 여러 기기 모드의 방 생성/입장을 구현한다.
6. Realtime 구독을 붙인다.
7. phase 기반 게임 진행을 구현한다.
8. UI/UX를 다듬는다.
9. lint/build를 통과시킨다.
10. README에 실행 방법과 Supabase 세팅 방법을 작성한다.

완료 후 반드시 아래를 요약한다.

- 생성/수정한 파일 목록
- 실행 방법
- Supabase 설정 방법
- 엑셀 파일 변환 방법
- 아직 남은 TODO
