import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import './App.css'
import { hasSupabaseConfig, missingSupabaseKeys, supabase } from './supabase'

type Person = {
  id: number
  name: string
  title: string
  image: string
}

type Score = {
  total: number
  count: number
}

type FaceRow = {
  id: number
  name: string
  title: string | null
  image_url: string
}

type RatingRow = {
  face_id: number
  score: number
}

type Locale = 'en' | 'ko' | 'es' | 'ja' | 'fr'

const DEVICE_RATED_FACE_IDS_STORAGE_KEY = 'rateme_rated_face_ids_v1'
const LOCALE_STORAGE_KEY = 'rateme_locale_v1'
const LEGACY_RATED_FACE_IDS_KEYS = ['rateme_rated_face_ids', 'rateme_rated_face_ids_anon', 'rateme_rated_face_ids_guest']
const LEGACY_RATED_FACE_IDS_PREFIX = 'rateme_rated_face_ids_'
const AUTH_PANEL_ANIMATION_MS = 220
const REFERENCE_STAR_URL =
  'https://ik.imagekit.io/rat3me/New%20Folder/pngtree-three-dimensional-golden-star-with-sharp-points-and-a-smooth-surface-png-image_16474576.png'
const LOCALE_OPTIONS: Array<{ value: Locale; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'ko', label: '한국어' },
  { value: 'es', label: 'Español' },
  { value: 'ja', label: '日本語' },
  { value: 'fr', label: 'Français' },
]

const messages: Record<Locale, Record<string, string>> = {
  en: {
    app_description: 'Tap a star and instantly move to the next random photo. Your score is shared in real time.',
    login: 'Log In',
    logout: 'Log Out',
    auth_signin_title: 'Log In',
    auth_signup_title: 'Sign Up',
    auth_signin_hint: 'Log in with your existing account and continue your rating history.',
    auth_signup_hint: 'Create a new account and start rating right away.',
    auth_email: 'Email',
    auth_password: 'Password',
    auth_password_confirm: 'Confirm Password',
    auth_switch_to_signup: "Don't have an account? Switch to Sign Up",
    auth_switch_to_signin: 'Already have an account? Switch to Log In',
    auth_google: 'Continue with Google',
    auth_or_email: 'or continue with email',
    mypage_open: 'My Page',
    mypage_title: 'My Page',
    mypage_email: 'Email',
    mypage_user_id: 'User ID',
    mypage_created_at: 'Created At',
    mypage_password_title: 'Change Password',
    mypage_new_password: 'New Password',
    mypage_confirm_password: 'Confirm New Password',
    mypage_update_password: 'Update Password',
    mypage_password_updated: 'Password updated successfully.',
    mypage_delete_title: 'Delete Account',
    mypage_delete_hint: 'Type DELETE to permanently remove your account.',
    mypage_delete_label: 'Type DELETE',
    mypage_delete_button: 'Delete Account',
    mypage_close: 'Close',
    mypage_password_mismatch: 'New password confirmation does not match.',
    mypage_delete_word_mismatch: 'Please type DELETE exactly.',
    mypage_update_failed: 'Failed to update password. Please try again.',
    mypage_delete_failed: 'Failed to delete account. Please try again.',
    sync_local: 'Local mode',
    sync_error: 'Connection error',
    sync_saving: 'Saving',
    loading_data: 'Loading data...',
    no_approved_faces: 'No approved face data found.',
    done_title: 'Completed',
    done_desc: 'You have rated all currently registered photos.',
    score_label: 'Current score',
    score_avg_aria: 'Current average {avg}',
    score_count: 'Rated by {count} people',
    score_hint: 'Click a score from 1 to 5.',
    last_vote_none: 'No ratings yet.',
    last_vote: 'Recent rating: {name} {rating}',
    missing_config: 'Missing Supabase config: {keys}',
    session_failed: 'Failed to fetch session. Please try again.',
    faces_failed: 'Failed to fetch faces. Check table/policies.',
    ratings_failed: 'Failed to fetch ratings. Check table/policies.',
    my_ratings_failed: 'Failed to fetch your rating history. Check ratings SELECT policy.',
    auth_need_email_password: 'Please enter email and password.',
    auth_password_len: 'Password must be at least 6 characters.',
    auth_password_mismatch: 'Password confirmation does not match.',
    auth_signup_verify_email: 'Sign-up complete. Verify your email, then log in.',
    auth_signup_done: 'Sign-up and login complete.',
    auth_signout_failed: 'Logout failed. Please try again.',
    auth_google_failed: 'Google sign-in failed. Please try again.',
    rating_save_failed: 'Failed to save rating. Check ratings INSERT policy.',
    score_star_sr: 'Current score star {index}',
    rating_aria: 'Give {star} points',
  },
  ko: {
    app_description: '별점을 누르는 순간, 다음 랜덤 사진으로 바로 넘어갑니다. 당신의 점수는 실시간으로 모두에게 공유됩니다.',
    login: '로그인',
    logout: '로그아웃',
    auth_signin_title: '로그인',
    auth_signup_title: '회원가입',
    auth_signin_hint: '기존 계정으로 로그인해서 내 평가 이력을 이어가세요.',
    auth_signup_hint: '새 계정을 만들고 바로 평가를 시작하세요.',
    auth_email: '이메일',
    auth_password: '비밀번호',
    auth_password_confirm: '비밀번호 확인',
    auth_switch_to_signup: '계정이 없나요? 회원가입 화면으로 전환',
    auth_switch_to_signin: '이미 계정이 있나요? 로그인 화면으로 전환',
    auth_google: 'Google로 계속하기',
    auth_or_email: '또는 이메일로 계속하기',
    mypage_open: '마이페이지',
    mypage_title: '마이페이지',
    mypage_email: '이메일',
    mypage_user_id: '유저 ID',
    mypage_created_at: '가입일',
    mypage_password_title: '비밀번호 변경',
    mypage_new_password: '새 비밀번호',
    mypage_confirm_password: '새 비밀번호 확인',
    mypage_update_password: '비밀번호 변경',
    mypage_password_updated: '비밀번호가 변경되었습니다.',
    mypage_delete_title: '회원 탈퇴',
    mypage_delete_hint: '계정을 영구 삭제하려면 DELETE를 입력하세요.',
    mypage_delete_label: 'DELETE 입력',
    mypage_delete_button: '회원 탈퇴',
    mypage_close: '닫기',
    mypage_password_mismatch: '새 비밀번호 확인이 일치하지 않습니다.',
    mypage_delete_word_mismatch: 'DELETE를 정확히 입력해 주세요.',
    mypage_update_failed: '비밀번호 변경 실패: 잠시 후 다시 시도해 주세요.',
    mypage_delete_failed: '회원 탈퇴 실패: 잠시 후 다시 시도해 주세요.',
    sync_local: '로컬 모드',
    sync_error: '연결 오류',
    sync_saving: '저장 중',
    loading_data: '데이터 불러오는 중...',
    no_approved_faces: 'approved 상태의 얼굴 데이터가 없습니다.',
    done_title: '평가 완료',
    done_desc: '현재 등록된 사진을 모두 평가했습니다.',
    score_label: '현재 점수',
    score_avg_aria: '현재 평균 {avg}점',
    score_count: '총 {count}명 평가',
    score_hint: '1점~5점 중 하나를 클릭하세요.',
    last_vote_none: '아직 평가가 없습니다.',
    last_vote: '최근 평가: {name} {rating}',
    missing_config: 'Supabase 설정 누락: {keys}',
    session_failed: '세션 조회 실패: 잠시 후 다시 시도해 주세요.',
    faces_failed: 'faces 조회 실패: 테이블/정책을 확인해 주세요.',
    ratings_failed: 'ratings 조회 실패: 테이블/정책을 확인해 주세요.',
    my_ratings_failed: '내 평가 기록 조회 실패: ratings SELECT 정책을 확인해 주세요.',
    auth_need_email_password: '이메일과 비밀번호를 입력해 주세요.',
    auth_password_len: '비밀번호는 6자 이상이어야 합니다.',
    auth_password_mismatch: '비밀번호 확인이 일치하지 않습니다.',
    auth_signup_verify_email: '회원가입 완료. 이메일 인증 후 로그인해 주세요.',
    auth_signup_done: '회원가입 및 로그인 완료.',
    auth_signout_failed: '로그아웃 실패: 잠시 후 다시 시도해 주세요.',
    auth_google_failed: 'Google 로그인 실패: 잠시 후 다시 시도해 주세요.',
    rating_save_failed: '점수 저장 실패: ratings INSERT 정책을 확인해 주세요.',
    score_star_sr: '현재 점수 별 {index}',
    rating_aria: '{star}점 주기',
  },
  es: {
    app_description: 'Toca una estrella y pasa al instante a la siguiente foto aleatoria. Tu puntuación se comparte en tiempo real.',
    login: 'Iniciar sesión',
    logout: 'Cerrar sesión',
    auth_signin_title: 'Iniciar sesión',
    auth_signup_title: 'Crear cuenta',
    auth_signin_hint: 'Inicia sesión con tu cuenta y continúa tu historial de valoraciones.',
    auth_signup_hint: 'Crea una cuenta nueva y empieza a valorar enseguida.',
    auth_email: 'Correo',
    auth_password: 'Contraseña',
    auth_password_confirm: 'Confirmar contraseña',
    auth_switch_to_signup: '¿No tienes cuenta? Cambiar a registro',
    auth_switch_to_signin: '¿Ya tienes cuenta? Cambiar a inicio de sesión',
    auth_google: 'Continuar con Google',
    auth_or_email: 'o continuar con correo',
    mypage_open: 'Mi perfil',
    mypage_title: 'Mi perfil',
    mypage_email: 'Correo',
    mypage_user_id: 'ID de usuario',
    mypage_created_at: 'Creado el',
    mypage_password_title: 'Cambiar contraseña',
    mypage_new_password: 'Nueva contraseña',
    mypage_confirm_password: 'Confirmar nueva contraseña',
    mypage_update_password: 'Actualizar contraseña',
    mypage_password_updated: 'Contraseña actualizada.',
    mypage_delete_title: 'Eliminar cuenta',
    mypage_delete_hint: 'Escribe DELETE para eliminar tu cuenta permanentemente.',
    mypage_delete_label: 'Escribe DELETE',
    mypage_delete_button: 'Eliminar cuenta',
    mypage_close: 'Cerrar',
    mypage_password_mismatch: 'La confirmación de la nueva contraseña no coincide.',
    mypage_delete_word_mismatch: 'Escribe DELETE exactamente.',
    mypage_update_failed: 'No se pudo actualizar la contraseña.',
    mypage_delete_failed: 'No se pudo eliminar la cuenta.',
    sync_local: 'Modo local',
    sync_error: 'Error de conexión',
    sync_saving: 'Guardando',
    loading_data: 'Cargando datos...',
    no_approved_faces: 'No hay rostros aprobados.',
    done_title: 'Completado',
    done_desc: 'Ya valoraste todas las fotos registradas.',
    score_label: 'Puntuación actual',
    score_avg_aria: 'Promedio actual {avg}',
    score_count: 'Valorado por {count} personas',
    score_hint: 'Haz clic en una puntuación del 1 al 5.',
    last_vote_none: 'Aún no hay valoraciones.',
    last_vote: 'Valoración reciente: {name} {rating}',
    missing_config: 'Falta configuración de Supabase: {keys}',
    session_failed: 'No se pudo obtener la sesión. Inténtalo de nuevo.',
    faces_failed: 'Error al consultar faces. Revisa tabla/políticas.',
    ratings_failed: 'Error al consultar ratings. Revisa tabla/políticas.',
    my_ratings_failed: 'Error al consultar tu historial. Revisa policy SELECT de ratings.',
    auth_need_email_password: 'Ingresa correo y contraseña.',
    auth_password_len: 'La contraseña debe tener al menos 6 caracteres.',
    auth_password_mismatch: 'La confirmación de contraseña no coincide.',
    auth_signup_verify_email: 'Registro completo. Verifica tu correo y luego inicia sesión.',
    auth_signup_done: 'Registro e inicio de sesión completados.',
    auth_signout_failed: 'Error al cerrar sesión. Inténtalo de nuevo.',
    auth_google_failed: 'Error en inicio de sesión con Google. Inténtalo de nuevo.',
    rating_save_failed: 'No se pudo guardar la valoración. Revisa policy INSERT de ratings.',
    score_star_sr: 'Estrella de puntuación actual {index}',
    rating_aria: 'Dar {star} puntos',
  },
  ja: {
    app_description: '星をタップすると次のランダム写真にすぐ移動します。あなたの評価はリアルタイムで共有されます。',
    login: 'ログイン',
    logout: 'ログアウト',
    auth_signin_title: 'ログイン',
    auth_signup_title: '新規登録',
    auth_signin_hint: '既存アカウントでログインして評価履歴を引き継ぎます。',
    auth_signup_hint: '新しいアカウントを作成してすぐに評価を始めましょう。',
    auth_email: 'メールアドレス',
    auth_password: 'パスワード',
    auth_password_confirm: 'パスワード確認',
    auth_switch_to_signup: 'アカウントがありませんか？ 新規登録へ',
    auth_switch_to_signin: 'アカウントをお持ちですか？ ログインへ',
    auth_google: 'Googleで続行',
    auth_or_email: 'またはメールで続行',
    mypage_open: 'マイページ',
    mypage_title: 'マイページ',
    mypage_email: 'メール',
    mypage_user_id: 'ユーザーID',
    mypage_created_at: '登録日時',
    mypage_password_title: 'パスワード変更',
    mypage_new_password: '新しいパスワード',
    mypage_confirm_password: '新しいパスワード確認',
    mypage_update_password: 'パスワード変更',
    mypage_password_updated: 'パスワードを変更しました。',
    mypage_delete_title: 'アカウント削除',
    mypage_delete_hint: 'DELETE と入力するとアカウントが完全に削除されます。',
    mypage_delete_label: 'DELETE を入力',
    mypage_delete_button: 'アカウント削除',
    mypage_close: '閉じる',
    mypage_password_mismatch: '新しいパスワード確認が一致しません。',
    mypage_delete_word_mismatch: 'DELETE を正確に入力してください。',
    mypage_update_failed: 'パスワード変更に失敗しました。',
    mypage_delete_failed: 'アカウント削除に失敗しました。',
    sync_local: 'ローカルモード',
    sync_error: '接続エラー',
    sync_saving: '保存中',
    loading_data: 'データを読み込み中...',
    no_approved_faces: '承認済みの顔データがありません。',
    done_title: '評価完了',
    done_desc: '現在登録されている写真をすべて評価しました。',
    score_label: '現在のスコア',
    score_avg_aria: '現在平均 {avg}',
    score_count: '評価人数 {count}人',
    score_hint: '1〜5のいずれかをクリックしてください。',
    last_vote_none: 'まだ評価がありません。',
    last_vote: '最近の評価: {name} {rating}',
    missing_config: 'Supabase設定が不足しています: {keys}',
    session_failed: 'セッション取得に失敗しました。後でもう一度お試しください。',
    faces_failed: 'facesの取得に失敗しました。テーブル/ポリシーを確認してください。',
    ratings_failed: 'ratingsの取得に失敗しました。テーブル/ポリシーを確認してください。',
    my_ratings_failed: '自分の評価履歴取得に失敗しました。ratings SELECTポリシーを確認してください。',
    auth_need_email_password: 'メールアドレスとパスワードを入力してください。',
    auth_password_len: 'パスワードは6文字以上である必要があります。',
    auth_password_mismatch: '確認用パスワードが一致しません。',
    auth_signup_verify_email: '登録完了。メール認証後にログインしてください。',
    auth_signup_done: '登録とログインが完了しました。',
    auth_signout_failed: 'ログアウトに失敗しました。後でもう一度お試しください。',
    auth_google_failed: 'Googleログインに失敗しました。後でもう一度お試しください。',
    rating_save_failed: '評価の保存に失敗しました。ratings INSERTポリシーを確認してください。',
    score_star_sr: '現在スコアの星 {index}',
    rating_aria: '{star}点をつける',
  },
  fr: {
    app_description: 'Touchez une étoile pour passer immédiatement à la photo aléatoire suivante. Votre note est partagée en temps réel.',
    login: 'Se connecter',
    logout: 'Se déconnecter',
    auth_signin_title: 'Connexion',
    auth_signup_title: "S'inscrire",
    auth_signin_hint: 'Connectez-vous pour continuer votre historique de notes.',
    auth_signup_hint: 'Créez un compte et commencez à noter immédiatement.',
    auth_email: 'E-mail',
    auth_password: 'Mot de passe',
    auth_password_confirm: 'Confirmer le mot de passe',
    auth_switch_to_signup: "Pas de compte ? Passer à l'inscription",
    auth_switch_to_signin: 'Déjà un compte ? Passer à la connexion',
    auth_google: 'Continuer avec Google',
    auth_or_email: 'ou continuer avec e-mail',
    mypage_open: 'Mon compte',
    mypage_title: 'Mon compte',
    mypage_email: 'E-mail',
    mypage_user_id: 'ID utilisateur',
    mypage_created_at: 'Créé le',
    mypage_password_title: 'Changer le mot de passe',
    mypage_new_password: 'Nouveau mot de passe',
    mypage_confirm_password: 'Confirmer le nouveau mot de passe',
    mypage_update_password: 'Mettre à jour',
    mypage_password_updated: 'Mot de passe mis à jour.',
    mypage_delete_title: 'Supprimer le compte',
    mypage_delete_hint: 'Tapez DELETE pour supprimer définitivement votre compte.',
    mypage_delete_label: 'Tapez DELETE',
    mypage_delete_button: 'Supprimer le compte',
    mypage_close: 'Fermer',
    mypage_password_mismatch: 'La confirmation du nouveau mot de passe ne correspond pas.',
    mypage_delete_word_mismatch: 'Veuillez saisir DELETE exactement.',
    mypage_update_failed: 'Échec de mise à jour du mot de passe.',
    mypage_delete_failed: 'Échec de suppression du compte.',
    sync_local: 'Mode local',
    sync_error: 'Erreur de connexion',
    sync_saving: 'Enregistrement',
    loading_data: 'Chargement des données...',
    no_approved_faces: 'Aucune donnée de visage approuvée.',
    done_title: 'Terminé',
    done_desc: 'Vous avez noté toutes les photos enregistrées.',
    score_label: 'Score actuel',
    score_avg_aria: 'Moyenne actuelle {avg}',
    score_count: 'Noté par {count} personnes',
    score_hint: 'Cliquez sur une note de 1 à 5.',
    last_vote_none: 'Aucune note pour le moment.',
    last_vote: 'Dernière note : {name} {rating}',
    missing_config: 'Configuration Supabase manquante : {keys}',
    session_failed: 'Échec de récupération de session. Veuillez réessayer.',
    faces_failed: 'Échec de lecture de faces. Vérifiez table/policies.',
    ratings_failed: 'Échec de lecture de ratings. Vérifiez table/policies.',
    my_ratings_failed: 'Échec de lecture de votre historique. Vérifiez la policy SELECT de ratings.',
    auth_need_email_password: 'Veuillez saisir e-mail et mot de passe.',
    auth_password_len: 'Le mot de passe doit contenir au moins 6 caractères.',
    auth_password_mismatch: 'La confirmation du mot de passe ne correspond pas.',
    auth_signup_verify_email: "Inscription terminée. Vérifiez votre e-mail puis connectez-vous.",
    auth_signup_done: 'Inscription et connexion terminées.',
    auth_signout_failed: 'Échec de déconnexion. Veuillez réessayer.',
    auth_google_failed: 'Échec de connexion Google. Veuillez réessayer.',
    rating_save_failed: "Échec de l'enregistrement de la note. Vérifiez la policy INSERT de ratings.",
    score_star_sr: 'Étoile du score actuel {index}',
    rating_aria: 'Donner {star} points',
  },
}

function detectInitialLocale(): Locale {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
  if (stored && stored in messages) {
    return stored as Locale
  }
  const browserLang = (navigator.language || 'en').toLowerCase()
  if (browserLang.startsWith('ko')) return 'ko'
  if (browserLang.startsWith('es')) return 'es'
  if (browserLang.startsWith('ja')) return 'ja'
  if (browserLang.startsWith('fr')) return 'fr'
  return 'en'
}

function buildInitialScores(faces: Person[]) {
  return faces.reduce<Record<number, Score>>((acc, person) => {
    acc[person.id] = { total: 0, count: 0 }
    return acc
  }, {})
}

function pickRandomPersonId(people: Person[], excludeId?: number | null) {
  if (people.length === 0) {
    return null
  }

  if (people.length === 1) {
    return people[0].id
  }

  const candidates = excludeId ? people.filter((person) => person.id !== excludeId) : people
  const randomIndex = Math.floor(Math.random() * candidates.length)
  return candidates[randomIndex].id
}

function toPersonRows(rows: FaceRow[]): Person[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    title: row.title ?? 'Untitled',
    image: row.image_url,
  }))
}

function aggregateScores(faces: Person[], ratings: RatingRow[]) {
  const nextScores = buildInitialScores(faces)

  ratings.forEach((rating) => {
    if (!nextScores[rating.face_id]) {
      return
    }

    nextScores[rating.face_id].total += Number(rating.score) || 0
    nextScores[rating.face_id].count += 1
  })

  return nextScores
}

function parseRatedFaceIds(raw: string | null) {
  if (!raw) {
    return []
  }

  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) {
    return []
  }

  return parsed.filter((value): value is number => typeof value === 'number')
}

function loadDeviceRatedFaceIds() {
  try {
    const merged = new Set<number>(parseRatedFaceIds(localStorage.getItem(DEVICE_RATED_FACE_IDS_STORAGE_KEY)))

    LEGACY_RATED_FACE_IDS_KEYS.forEach((key) => {
      parseRatedFaceIds(localStorage.getItem(key)).forEach((id) => merged.add(id))
    })

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key) {
        continue
      }
      if (key.startsWith(LEGACY_RATED_FACE_IDS_PREFIX)) {
        parseRatedFaceIds(localStorage.getItem(key)).forEach((id) => merged.add(id))
      }
    }

    return Array.from(merged)
  } catch {
    return []
  }
}

function ScoreStar({ fillRatio, srText }: { fillRatio: number; srText: string }) {
  const clippedRight = Math.round((1 - Math.max(0, Math.min(1, fillRatio))) * 100)
  return (
    <span className="score-star-figure">
      <img className="score-star-icon-image empty" src={REFERENCE_STAR_URL} alt="" loading="lazy" decoding="async" />
      <img
        className="score-star-icon-image filled"
        src={REFERENCE_STAR_URL}
        alt=""
        loading="lazy"
        decoding="async"
        style={{ clipPath: `inset(0 ${clippedRight}% 0 0)` }}
      />
      <span className="sr-only">{srText}</span>
    </span>
  )
}

function App() {
  const [locale, setLocale] = useState<Locale>(() => detectInitialLocale())
  const [session, setSession] = useState<Session | null>(null)
  const [showAuthPanel, setShowAuthPanel] = useState(false)
  const [isAuthPanelClosing, setIsAuthPanelClosing] = useState(false)
  const [showMyPage, setShowMyPage] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authNotice, setAuthNotice] = useState<string | null>(null)
  const [mypageError, setMypageError] = useState<string | null>(null)
  const [mypageNotice, setMypageNotice] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [isMypageBusy, setIsMypageBusy] = useState(false)
  const [people, setPeople] = useState<Person[]>([])
  const [currentId, setCurrentId] = useState<number | null>(null)
  const [scores, setScores] = useState<Record<number, Score>>({})
  const [hoverStars, setHoverStars] = useState(0)
  const [lastVote, setLastVote] = useState<{ rating: number; personName: string } | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [pendingWrites, setPendingWrites] = useState(0)
  const [ratedFaceIds, setRatedFaceIds] = useState<number[]>(() => loadDeviceRatedFaceIds())
  const authPanelCloseTimerRef = useRef<number | null>(null)

  const ratedFaceIdsSet = useMemo(() => new Set(ratedFaceIds), [ratedFaceIds])
  const unratedPeople = useMemo(
    () => people.filter((person) => !ratedFaceIdsSet.has(person.id)),
    [people, ratedFaceIdsSet],
  )
  const isAllRated = !isLoading && people.length > 0 && unratedPeople.length === 0

  const currentPerson = unratedPeople.find((person) => person.id === currentId) ?? null
  const currentScore = currentPerson ? scores[currentPerson.id] ?? { total: 0, count: 0 } : { total: 0, count: 0 }
  const currentAverage = currentScore.count ? currentScore.total / currentScore.count : 0
  const t = (key: string, vars?: Record<string, string | number>) => {
    const template = messages[locale][key] ?? messages.en[key] ?? key
    if (!vars) {
      return template
    }
    return Object.entries(vars).reduce((acc, [name, value]) => acc.replace(`{${name}}`, String(value)), template)
  }

  const closeAuthPanel = () => {
    if (!showAuthPanel || isAuthPanelClosing) {
      return
    }
    setIsAuthPanelClosing(true)
    authPanelCloseTimerRef.current = window.setTimeout(() => {
      setShowAuthPanel(false)
      setIsAuthPanelClosing(false)
      authPanelCloseTimerRef.current = null
    }, AUTH_PANEL_ANIMATION_MS)
  }

  useEffect(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  }, [locale])

  useEffect(() => {
    if (unratedPeople.length === 0) {
      setCurrentId(null)
      return
    }

    if (!currentId || !unratedPeople.some((person) => person.id === currentId)) {
      setCurrentId(pickRandomPersonId(unratedPeople))
    }
  }, [unratedPeople, currentId])

  useEffect(() => {
    return () => {
      if (authPanelCloseTimerRef.current !== null) {
        window.clearTimeout(authPanelCloseTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!supabase || !hasSupabaseConfig) {
      return
    }

    const client = supabase

    const initializeSession = async () => {
      const { data, error } = await client.auth.getSession()

      if (error) {
        setAuthError(t('session_failed'))
      } else {
        setSession(data.session)
      }

    }

    void initializeSession()

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) {
      localStorage.setItem(DEVICE_RATED_FACE_IDS_STORAGE_KEY, JSON.stringify(ratedFaceIds))
    }
  }, [ratedFaceIds, session])

  useEffect(() => {
    if (!supabase || !hasSupabaseConfig) {
      setSyncError(t('missing_config', { keys: missingSupabaseKeys.join(', ') }))
      setIsLoading(false)
      return
    }

    const client = supabase

    let isCancelled = false

    const refreshFromDb = async () => {
      const [facesResult, ratingsResult, myRatingsResult] = await Promise.all([
        client.from('faces').select('id,name,title,image_url').eq('status', 'approved'),
        client.from('ratings').select('face_id,score'),
        session
          ? client.from('ratings').select('face_id').eq('user_id', session.user.id)
          : Promise.resolve({ data: [], error: null }),
      ])

      if (isCancelled) {
        return
      }

      if (facesResult.error) {
        setSyncError(t('faces_failed'))
        setIsLoading(false)
        return
      }

      if (ratingsResult.error) {
        setSyncError(t('ratings_failed'))
        setIsLoading(false)
        return
      }
      if (myRatingsResult.error) {
        setSyncError(t('my_ratings_failed'))
        setIsLoading(false)
        return
      }

      const nextPeople = toPersonRows((facesResult.data ?? []) as FaceRow[])
      const nextScores = aggregateScores(nextPeople, (ratingsResult.data ?? []) as RatingRow[])

      setPeople(nextPeople)
      setScores(nextScores)
      const myRatedFaceIds = ((myRatingsResult.data ?? []) as Array<{ face_id: number }>).map((row) => row.face_id)
      if (session) {
        // 로그인 상태에서는 해당 계정의 평가 이력만 기준으로 필터링
        setRatedFaceIds(Array.from(new Set(myRatedFaceIds)))
      } else {
        // 비로그인 상태에서는 기기(localStorage) 이력 기준으로 필터링
        setRatedFaceIds(Array.from(new Set(loadDeviceRatedFaceIds())))
      }
      setSyncError(null)
      setIsLoading(false)
    }

    void refreshFromDb()

    const channel = client
      .channel('rateme-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ratings' },
        () => {
          void refreshFromDb()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'faces' },
        () => {
          void refreshFromDb()
        },
      )
      .subscribe()

    return () => {
      isCancelled = true
      void client.removeChannel(channel)
    }
  }, [session, locale])

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) {
      return
    }

    setAuthError(null)
    setAuthNotice(null)

    if (!email || !password) {
      setAuthError(t('auth_need_email_password'))
      return
    }

    if (password.length < 6) {
      setAuthError(t('auth_password_len'))
      return
    }

    if (authMode === 'signup' && password !== confirmPassword) {
      setAuthError(t('auth_password_mismatch'))
      return
    }

    const client = supabase

    if (authMode === 'signup') {
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
      })

      if (error) {
        setAuthError(error.message)
        return
      }

      setPassword('')
      setConfirmPassword('')
      if (!data.session) {
        setAuthNotice(t('auth_signup_verify_email'))
      } else {
        setAuthNotice(t('auth_signup_done'))
        closeAuthPanel()
      }

      return
    }

    const { error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      setAuthError(error.message)
      return
    }

    setPassword('')
    setConfirmPassword('')
    closeAuthPanel()
  }

  const handleSignOut = async () => {
    if (!supabase) {
      return
    }

    const { error } = await supabase.auth.signOut()
    if (error) {
      setAuthError(t('auth_signout_failed'))
    }
  }

  const handleGoogleSignIn = async () => {
    if (!supabase) {
      return
    }

    setAuthError(null)
    setAuthNotice(null)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${window.location.pathname}`,
      },
    })

    if (error) {
      setAuthError(t('auth_google_failed'))
    }
  }

  const handlePasswordUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase || !session) {
      return
    }

    setMypageError(null)
    setMypageNotice(null)

    if (newPassword.length < 6) {
      setMypageError(t('auth_password_len'))
      return
    }

    if (newPassword !== confirmNewPassword) {
      setMypageError(t('mypage_password_mismatch'))
      return
    }

    setIsMypageBusy(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setIsMypageBusy(false)

    if (error) {
      setMypageError(t('mypage_update_failed'))
      return
    }

    setNewPassword('')
    setConfirmNewPassword('')
    setMypageNotice(t('mypage_password_updated'))
  }

  const handleDeleteAccount = async () => {
    if (!supabase || !session) {
      return
    }

    setMypageError(null)
    setMypageNotice(null)

    if (deleteConfirmText.trim() !== 'DELETE') {
      setMypageError(t('mypage_delete_word_mismatch'))
      return
    }

    setIsMypageBusy(true)
    const { error } = await supabase.rpc('delete_my_account')
    setIsMypageBusy(false)

    if (error) {
      setMypageError(t('mypage_delete_failed'))
      return
    }

    await supabase.auth.signOut()
    setShowMyPage(false)
  }

  const handleRating = async (rating: number) => {
    if (!supabase || !currentPerson) {
      return
    }
    const client = supabase

    const ratedPerson = currentPerson
    const ratedPersonId = currentPerson.id
    const nextPeople = unratedPeople.filter((person) => person.id !== ratedPersonId)

    setScores((prev) => ({
      ...prev,
      [ratedPersonId]: {
        total: (prev[ratedPersonId]?.total ?? 0) + rating,
        count: (prev[ratedPersonId]?.count ?? 0) + 1,
      },
    }))

    setLastVote({ rating, personName: ratedPerson.name })
    setHoverStars(0)
    setRatedFaceIds((prev) => (prev.includes(ratedPersonId) ? prev : [...prev, ratedPersonId]))
    setCurrentId(pickRandomPersonId(nextPeople))

    setPendingWrites((prev) => prev + 1)

    const payload = session
      ? { face_id: ratedPersonId, score: rating, user_id: session.user.id }
      : { face_id: ratedPersonId, score: rating }

    const { error } = await client.from('ratings').insert(payload)

    setPendingWrites((prev) => Math.max(0, prev - 1))

    if (error) {
      setSyncError(t('rating_save_failed'))
    }
  }

  const syncLabel = !hasSupabaseConfig
    ? t('sync_local')
    : syncError
      ? t('sync_error')
      : pendingWrites > 0
        ? t('sync_saving')
        : ''
  const isSignupMode = authMode === 'signup'

  if (!hasSupabaseConfig) {
    return (
      <main className="app-shell">
        <p className="eyebrow">RATEME</p>
        <p className="sync-error">{t('missing_config', { keys: missingSupabaseKeys.join(', ') })}</p>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="top-row">
        <p className="eyebrow">RATEME</p>
        <div className="top-controls">
          <label className="lang-select-wrap" htmlFor="locale-select">
            <select
              id="locale-select"
              className="lang-select"
              value={locale}
              onChange={(event) => setLocale(event.target.value as Locale)}
            >
              {LOCALE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {!session ? (
            <button
              type="button"
              className="login-mini login"
              onClick={() => {
                if (showAuthPanel) {
                  closeAuthPanel()
                } else {
                  setIsAuthPanelClosing(false)
                  setShowAuthPanel(true)
                }
                setAuthError(null)
                setAuthNotice(null)
              }}
            >
              {t('login')}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="login-mini profile"
                onClick={() => {
                  setShowMyPage((prev) => !prev)
                  setMypageError(null)
                  setMypageNotice(null)
                }}
              >
                {t('mypage_open')}
              </button>
              <button type="button" className="login-mini logout" onClick={() => void handleSignOut()}>
                {t('logout')}
              </button>
            </>
          )}
        </div>
      </section>
      <p className="description">{t('app_description')}</p>
      {(showAuthPanel || isAuthPanelClosing) && !session && (
        <section
          className={`auth-card ${isSignupMode ? 'signup' : 'signin'} ${isAuthPanelClosing ? 'auth-card-exit' : 'auth-card-enter'}`}
        >
          <div key={authMode} className="auth-mode-content">
            <h2>{authMode === 'signin' ? t('auth_signin_title') : t('auth_signup_title')}</h2>
            <p className="auth-mode-hint">
              {isSignupMode ? t('auth_signup_hint') : t('auth_signin_hint')}
            </p>
            <button type="button" className="auth-google" onClick={() => void handleGoogleSignIn()}>
              <span className="auth-google-mark" aria-hidden="true">
                G
              </span>
              {t('auth_google')}
            </button>
            <p className="auth-divider" aria-hidden="true">
              {t('auth_or_email')}
            </p>
            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <label htmlFor="email">{t('auth_email')}</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
              <label htmlFor="password">{t('auth_password')}</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                minLength={6}
                required
              />
              {authMode === 'signup' && (
                <>
                  <label htmlFor="confirm-password">{t('auth_password_confirm')}</label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                </>
              )}
              <button type="submit" className={`auth-submit ${isSignupMode ? 'signup' : 'signin'}`}>
                {authMode === 'signin' ? t('auth_signin_title') : t('auth_signup_title')}
              </button>
            </form>
            <button
              type="button"
              className="auth-switch"
              onClick={() => {
                setAuthMode((prev) => (prev === 'signin' ? 'signup' : 'signin'))
                setAuthError(null)
                setAuthNotice(null)
              }}
            >
              {authMode === 'signin' ? t('auth_switch_to_signup') : t('auth_switch_to_signin')}
            </button>
          </div>
          {authNotice && <p className="auth-notice">{authNotice}</p>}
          {authError && <p className="sync-error">{authError}</p>}
        </section>
      )}
      {showMyPage && session && (
        <section className="mypage-card">
          <h2>{t('mypage_title')}</h2>
          <p className="mypage-meta">
            <strong>{t('mypage_email')}:</strong> {session.user.email ?? '-'}
          </p>

          <form className="mypage-form" onSubmit={handlePasswordUpdate}>
            <h3>{t('mypage_password_title')}</h3>
            <label htmlFor="mypage-new-password">{t('mypage_new_password')}</label>
            <input
              id="mypage-new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
            <label htmlFor="mypage-confirm-new-password">{t('mypage_confirm_password')}</label>
            <input
              id="mypage-confirm-new-password"
              type="password"
              value={confirmNewPassword}
              onChange={(event) => setConfirmNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
            <button type="submit" className="mypage-action" disabled={isMypageBusy}>
              {t('mypage_update_password')}
            </button>
          </form>

          <section className="mypage-danger">
            <h3>{t('mypage_delete_title')}</h3>
            <p>{t('mypage_delete_hint')}</p>
            <label htmlFor="mypage-delete-confirm">{t('mypage_delete_label')}</label>
            <input
              id="mypage-delete-confirm"
              type="text"
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              autoComplete="off"
            />
            <button
              type="button"
              className="mypage-danger-btn"
              disabled={isMypageBusy}
              onClick={() => void handleDeleteAccount()}
            >
              {t('mypage_delete_button')}
            </button>
          </section>

          <button type="button" className="auth-switch" onClick={() => setShowMyPage(false)}>
            {t('mypage_close')}
          </button>
          {mypageNotice && <p className="auth-notice">{mypageNotice}</p>}
          {mypageError && <p className="sync-error">{mypageError}</p>}
        </section>
      )}
      {syncLabel && <p className={`sync-status ${syncError ? 'error' : ''}`}>{syncLabel}</p>}

      {isLoading && <p className="sync-error">{t('loading_data')}</p>}

      {!isLoading && !currentPerson && !isAllRated && <p className="sync-error">{t('no_approved_faces')}</p>}

      {isAllRated && (
        <section className="summary">
          <h3>{t('done_title')}</h3>
          <p>{t('done_desc')}</p>
        </section>
      )}

      {currentPerson && (
        <>
          <section className="hero">
            <img src={currentPerson.image} alt={`${currentPerson.name} portrait`} />
            <div className="hero-overlay">
              <p>{currentPerson.title}</p>
              <h2>{currentPerson.name}</h2>
            </div>
          </section>

          <section className="score-box">
            <p className="score-label">{t('score_label')}</p>
            <p className="score-number" aria-label={t('score_avg_aria', { avg: currentAverage.toFixed(2) })}>
              {[1, 2, 3, 4, 5].map((star) => (
                <ScoreStar
                  key={star}
                  fillRatio={Math.max(0, Math.min(1, currentAverage - (star - 1)))}
                  srText={t('score_star_sr', { index: star })}
                />
              ))}
            </p>
            <p className="score-sub">{t('score_count', { count: currentScore.count })}</p>

            <div className="stars" onMouseLeave={() => setHoverStars(0)}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className={`star ${hoverStars >= star ? 'filled' : ''}`}
                  onMouseEnter={() => setHoverStars(star)}
                  onClick={() => {
                    void handleRating(star)
                  }}
                  aria-label={t('rating_aria', { star })}
                >
                  <span className="rate-star-figure" aria-hidden="true">
                    <img
                      className="rate-star-icon-image empty"
                      src={REFERENCE_STAR_URL}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                    <img
                      className="rate-star-icon-image filled"
                      src={REFERENCE_STAR_URL}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                </button>
              ))}
            </div>

            <p className="hint">{t('score_hint')}</p>
          </section>
        </>
      )}

      <section className="summary">
        <p className="last-vote">
          {lastVote ? t('last_vote', { name: lastVote.personName, rating: `${lastVote.rating}` }) : t('last_vote_none')}
        </p>
        {syncError && <p className="sync-error">{syncError}</p>}
      </section>
    </main>
  )
}

export default App
