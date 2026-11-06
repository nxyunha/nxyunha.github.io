# 기능 명세: 짧은 방명록 (Guestbook)

> 이 문서는 구현 전 설계 기록입니다. 아직 코드는 작성하지 않았고, 커밋·push도 하지 않았습니다.
> 작성일: 2026-11-06

## 1. 개요

- **기능 이름:** 짧은 방명록
- **목적:** 홈페이지 방문자가 짧은 응원이나 질문을 남길 수 있게 한다.
- **사용자 행동:** 방문자가 별명과 한 줄 메시지를 입력하고 등록 버튼을 눌러 글을 남긴다.
- **저장/조회:** 작성한 글은 Supabase에 저장하고, 홈페이지에서 최근 작성순으로 확인한다.
- **다른 기기:** 데이터가 Supabase에 저장되므로 어느 기기에서 접속해도 같은 목록이 보인다.

## 2. 현재 프로젝트 전제

- 홈페이지는 빌드 도구·프레임워크 없는 정적 HTML 단일 파일(`index.html`)이다.
- 현재 배포는 GitHub Pages 사용자 사이트(`nxyunha.github.io`, `main` 브랜치 루트). 이번 기능부터 **Netlify로 이전**한다(7번 참고).
- 서버가 없으므로 데이터는 외부 서비스(Supabase)에 저장한다. 브라우저에서 Supabase로 직접 통신한다.

## 3. 화면 구성

기존 디자인(파란 계열, 카드, `reveal` 효과)을 따르고, `#contact` 섹션 앞에 `05 / GUESTBOOK` 섹션 하나를 추가한다.

### 입력 영역
- 별명 입력란: `<input type="text">`, 2~12자 (`maxlength="12"`, 최소 2자는 스크립트에서 검사)
- 메시지 입력란: `<textarea>`, 최대 100자 (`maxlength="100"`), 남은 글자 수 표시
- 등록 버튼: `<button type="submit">`
- 상태 메시지 영역: `role="status"` / `aria-live="polite"` (성공·실패 안내, 접근성 유지)

### 결과 영역
- 최근 작성순(최신이 위) 목록
- 각 항목: 별명, 메시지, 작성 시각
- 각 항목의 별명·메시지는 **일반 텍스트로만 출력**한다. 방문자가 입력한 값을 HTML로 실행하지 않는다.
- 출력 시 `innerHTML`을 사용하지 않고 `textContent`(또는 `createTextNode`) 등 안전한 방식으로 넣는다.
- 비어 있을 때: "아직 남겨진 메시지가 없어요" 안내

## 4. 저장할 데이터 (Supabase 테이블 `guestbook`)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | `bigint` (자동 증가, generated always as identity) | 기본 키 |
| `nickname` | `text` | 별명 (2~12자) |
| `message` | `text` | 메시지 (1~100자) |
| `created_at` | `timestamptz` (기본값 `now()`) | 작성 시각, 정렬 기준 |

### DB 제약 (양쪽 검사 중 서버 측)
브라우저에서 1차 검사하고, Supabase 데이터베이스에서도 아래 제약으로 다시 검사한다(양쪽 검사).
- `nickname`: `char_length(nickname) between 2 and 12`
- `message`: `char_length(message) between 1 and 100`

## 5. 성공·실패 동작

| 상황 | 동작 |
|------|------|
| 정상 입력 후 등록 | Supabase insert → 입력란 비움 → 목록 맨 위에 새 글 표시 → "등록되었습니다" |
| 별명 또는 메시지가 빈칸 | 저장 안 함 → "별명과 메시지를 모두 입력해 주세요" |
| 별명 글자 수 범위 벗어남 (2자 미만 / 12자 초과) 또는 메시지 100자 초과 | 저장 안 함 → "별명은 2~12자, 메시지는 100자 이내로 입력해 주세요" (브라우저 1차 검사 + DB 제약 2차 검사) |
| 네트워크/서버 오류 | 저장 안 함 → "잠시 후 다시 시도해 주세요" |
| 페이지 접속 / 새로고침 | Supabase에서 최신순 조회 → 목록 표시 (다른 기기에서도 동일) |

## 6. 데이터 흐름

- 조회: `select id, nickname, message, created_at from guestbook order by created_at desc limit 50`
- 등록: `insert into guestbook (nickname, message) values (...)`
- Supabase JS 클라이언트는 CDN `<script>`로 불러온다(빌드 도구 없음).

### 안전한 출력 (XSS 방지)
- 방문자가 입력한 별명·메시지는 신뢰할 수 없는 값이므로, 화면에 출력할 때 **HTML로 실행하지 않고 일반 텍스트로만** 표시한다.
- `innerHTML`은 사용하지 않는다. `element.textContent = value` 또는 `document.createTextNode(value)` 로 넣는다.
- 예: `<b>안녕</b>` 을 입력해도 태그가 실행되지 않고 문자 그대로 보여야 한다.

## 7. 배포 서비스 비교 (Netlify vs Vercel)

방명록은 서버 로직이 필요 없고 브라우저에서 Supabase로 직접 통신하므로 어떤 정적 호스팅에서도 동작한다. 두 후보를 비교한 뒤 Netlify를 선택한다.

| 항목 | Netlify | Vercel |
|------|---------|--------|
| 정적 사이트 배포 | 쉬움, GitHub 연동 자동 배포 | 쉬움, GitHub 연동 자동 배포 |
| 강점 | 정적 사이트 부가기능(폼·리다이렉트 등) 풍부 | Next.js 등 프레임워크에 최적화 |
| 이 프로젝트 적합도 | 순수 정적 HTML에 잘 맞음 | 프레임워크 없는 단일 HTML엔 장점이 덜 드러남 |
| 환경변수 관리 | 지원 | 지원 |

**결정: Netlify로 배포한다.** Vercel은 Next.js 같은 프레임워크에 강점이 커서 프레임워크 없는 단일 HTML에는 이점이 작다. 순수 정적 사이트에는 Netlify가 더 잘 맞는다.

### GitHub Pages 대신 Netlify로 이전하는 이유
- **환경변수 관리:** Netlify는 Supabase URL·anon 키 같은 값을 배포 환경변수로 관리할 수 있다. GitHub Pages는 순수 정적 호스팅이라 이런 설정 화면이 없다.
- **자동 배포·배포 미리보기:** GitHub 연동으로 push하면 자동 배포되고, 배포 전 미리보기(deploy preview)를 제공한다.
- **정적 사이트 부가기능:** 리다이렉트·헤더·폼 처리 등 정적 사이트에 필요한 기능을 설정 파일로 쉽게 다룰 수 있다.
- 주의: 배포 위치를 옮기더라도 방명록 데이터 저장·조회는 그대로 Supabase가 담당한다. 배포 서비스 변경은 데이터 동작에 영향을 주지 않는다.

## 8. 가장 작은 완성 버전 (채택)

현재 `index.html`에 방명록 섹션 하나만 추가하고, 배포는 Netlify로 이전한다.
- 새 파일·빌드 도구·프레임워크 없음(단일 HTML 유지)
- Supabase JS 클라이언트는 CDN `<script>`로 로드
- 테이블 1개(`guestbook`), 조회(select)·등록(insert) 두 동작만 구현

## 9. 접근 제한 (자유 입력 방식)

로그인 없이 누구나 글을 남기는 자유 입력이다. 브라우저에 Supabase `anon` 키가 노출되므로 접근 제한이 필수다. Supabase RLS(Row Level Security)로 제한한다.

- RLS **활성화** (기본 모든 접근 차단)
- **insert 허용** 정책: 누구나 새 글 작성 가능
- **select 허용** 정책: 누구나 목록 조회 가능
- **update / delete 정책 없음** → 아무도 수정·삭제 불가
- 홈페이지 코드에는 `anon`(공개용) 키만 사용한다. `service_role` 키는 절대 넣지 않는다.
- 추가 보호: 글자 수 제한(앱 + DB `check` 제약)

### 참고 정책 예시 (SQL)
```sql
alter table guestbook enable row level security;

create policy "anyone can read"
  on guestbook for select
  using (true);

create policy "anyone can insert"
  on guestbook for insert
  with check (
    char_length(nickname) between 2 and 12
    and char_length(message) between 1 and 100
  );
-- update, delete 정책은 만들지 않는다 (차단 유지)
```

## 10. 검사 방법 (완성 기준 확인)

| # | 검사 항목 | 방법 | 기대 결과 |
|---|-----------|------|-----------|
| 1 | 정상 등록 | 별명·메시지 입력 후 등록 | 목록 맨 위에 새 글 표시, "등록되었습니다" |
| 2 | 빈 메시지 차단 | 메시지 비우고 등록 | 저장 안 됨, 안내 메시지 표시 |
| 3 | 빈 별명 차단 | 별명 비우고 등록 | 저장 안 됨, 안내 메시지 표시 |
| 4 | 별명 글자 수 검사 | 별명 1자 / 13자 이상 시도 | 저장 안 됨, 2~12자 안내 (브라우저 `maxlength`·최소 길이 검사 + DB 제약) |
| 5 | 메시지 글자 수 초과 차단 | 100자 초과 메시지 시도 | 저장 안 됨, `maxlength`로 입력 제한 + 초과 안내 |
| 6 | HTML 태그 미실행 (XSS) | 메시지 또는 별명에 `<b>안녕</b>` 입력 후 등록 | 태그가 실행되지 않고 `<b>안녕</b>` 문자 그대로 표시됨 (굵게 표시되지 않음) |
| 7 | 최신순 정렬 | 글 여러 개 등록 | 최신 글이 맨 위 |
| 8 | 다른 기기 확인 | 다른 브라우저/기기에서 접속 | 작성된 글이 동일하게 보임 |
| 9 | 새로고침 유지 | 페이지 새로고침 | 저장된 글이 그대로 조회됨 |
| 10 | 수정·삭제 차단 | (개발자) anon 키로 update/delete 시도 | RLS로 거부됨 |
| 11 | 네트워크 오류 처리 | 네트워크 차단 후 등록 | "잠시 후 다시 시도해 주세요" 안내, 앱이 멈추지 않음 |

## 11. 진행 상태

- [x] 설계 및 명세 작성 (이 문서)
- [x] Netlify 배포 구성 (public 공개 폴더, netlify.toml, .gitignore)
- [x] 방명록 구현: 브라우저 JS가 Supabase anon 키로 직접 통신 (서버 함수 미사용)
- [x] 로컬 서빙 검사 (방명록 섹션·폼·Supabase CDN 로드, textContent 출력 확인)
- [ ] Supabase 프로젝트/테이블/RLS 설정 (대시보드 작업)
- [ ] public/index.html 의 SUPABASE_URL / SUPABASE_ANON_KEY 실제 값 입력
- [ ] 브라우저 실제 동작 검사(섹션 10 전체)
- [ ] 커밋·push

## 배포 결과 (Netlify)

- 배포 서비스: Netlify
- 프로젝트(사이트) 이름: `coruscating-bunny-e8d1f0`
- 배포 주소: https://coruscating-bunny-e8d1f0.netlify.app/
- 배포 상태: 성공 (2026-11-06 확인)

## 12. 배포 구성 메모 (1번 방식: 브라우저 직접 통신)

- 공개 폴더: `public/` (여기에 있는 것만 배포됨). 현재 `public/index.html` 1개.
- 서버 함수 미사용: `netlify.toml` 에 functions 설정 없음. `netlify/functions` 폴더도 없음.
- anon 키는 공개 키이므로 `public/index.html` 스크립트 상단 상수에 직접 넣는다. (현재 `YOUR_SUPABASE_URL` / `YOUR_SUPABASE_ANON_KEY` placeholder)
- 데이터 보호는 전적으로 Supabase RLS 에 의존한다(섹션 9).
- 루트 `index.html` 은 기존 GitHub Pages 용으로 보존(변경 없음). public 복사본과 별개.

### Netlify 대시보드 입력값

| 항목 | 값 |
|------|-----|
| Repository | `nxyunha/nxyunha.github.io` |
| Branch to deploy | `main` |
| Base directory | (비움) |
| Build command | (비움, 빌드 없음) |
| Publish directory | `public` |

환경변수: 1번 방식은 anon 키를 코드에 직접 넣으므로 Netlify 환경변수는 필수가 아니다.
