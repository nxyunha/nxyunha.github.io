// 방명록 서버 함수 (Netlify Functions)
//
// 역할: 브라우저 → (이 함수) → Supabase 구조의 중간 서버.
//   - GET  : 최신 방명록 조회 (최대 LIST_LIMIT 개) + 전체 건수(count)
//   - POST : 별명 2~12자, 메시지 1~100자 검증 후 등록
//
// 비밀 키는 코드에 적지 않고 환경변수로만 읽는다.
//   - SUPABASE_URL
//   - SUPABASE_SECRET_KEY  (우선 사용. 없으면 SUPABASE_SERVICE_ROLE_KEY 로 폴백)
//
// 참고: 서버 전용 키(기존 service_role JWT 또는 새 sb_secret_ 키)는
// 둘 다 service_role 권한으로 동작하며 RLS 를 우회한다. 따라서 이 키는
// 서버(이 함수)에서만 사용하고, 입력 검증 책임은 전적으로 이 함수에 있다.
// @supabase/supabase-js 의 createClient 는 두 키 형식을 그대로 받으므로
// 키 형식에 맞춘 별도 인증 방식을 임의로 만들지 않는다.

const { createClient } = require("@supabase/supabase-js");

const NICK_MIN = 2;
const NICK_MAX = 12;
const MSG_MAX = 100;

// 목록 조회 상한. 방명록 표시는 최신순이면 충분하므로 무제한 대신
// 넉넉한 상한을 둔다(과도한 로딩·비용 방지). 정확한 전체 개수는
// 아래 count 로 따로 세어 조회 상한 때문에 집계가 틀어지지 않게 한다.
const LIST_LIMIT = 200;

// 공통 JSON 응답 헬퍼
function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

// 환경변수로 Supabase 클라이언트 생성 (키는 코드에 없음)
function getClient() {
  const url = process.env.SUPABASE_URL;
  // 새 형식 secret 키(SUPABASE_SECRET_KEY)를 우선 사용하고,
  // 없을 때만 레거시 service_role 키(SUPABASE_SERVICE_ROLE_KEY)로 폴백한다.
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null; // 환경변수 미설정
  }
  // 서버 함수는 세션을 유지할 필요가 없으므로 자동 토큰 갱신/세션 저장을 끈다.
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

exports.handler = async function (event) {
  const supabase = getClient();
  if (!supabase) {
    return json(500, { error: "서버 설정이 완료되지 않았습니다." });
  }

  // ===== 조회 =====
  if (event.httpMethod === "GET") {
    try {
      // count: "exact" 로 전체 건수를 정확히 센다. limit 은 반환 행 수만 제한하며
      // count 는 limit 과 무관하게 전체 개수를 돌려주므로 집계가 누락되지 않는다.
      const { data, count, error } = await supabase
        .from("guestbook")
        .select("id, nickname, message, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT);

      if (error) throw error;
      const entries = data || [];
      return json(200, {
        entries,
        total: typeof count === "number" ? count : entries.length,
        limit: LIST_LIMIT,
      });
    } catch (e) {
      return json(500, { error: "메시지를 불러오지 못했습니다." });
    }
  }

  // ===== 등록 =====
  if (event.httpMethod === "POST") {
    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch (e) {
      return json(400, { error: "요청 형식이 올바르지 않습니다." });
    }

    // 문자열이 아닐 수도 있으므로 안전하게 문자열화 후 공백 제거
    const nickname = typeof payload.nickname === "string" ? payload.nickname.trim() : "";
    const message = typeof payload.message === "string" ? payload.message.trim() : "";

    // 서버 측 검증 (service_role 은 RLS 를 우회하므로 여기서 반드시 검사)
    if (!nickname || !message) {
      return json(400, { error: "별명과 메시지를 모두 입력해 주세요." });
    }
    if (
      nickname.length < NICK_MIN ||
      nickname.length > NICK_MAX ||
      message.length > MSG_MAX
    ) {
      return json(400, {
        error: "별명은 2~12자, 메시지는 100자 이내로 입력해 주세요.",
      });
    }

    try {
      // id, created_at 은 클라이언트 값을 믿지 않고 DB 가 자동 생성한다.
      const { error } = await supabase
        .from("guestbook")
        .insert({ nickname, message });

      if (error) throw error;
      return json(201, { ok: true });
    } catch (e) {
      return json(500, { error: "등록하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
  }

  // ===== 그 외 메서드 =====
  return json(405, { error: "지원하지 않는 요청입니다." });
};
