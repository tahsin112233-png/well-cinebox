use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use moviebox_tui::models::BrowseMetrics;
use moviebox_tui::providers::{
    ProviderError, ProviderKind, Release, ReleaseProvider, ResolutionIntent,
};
use moviebox_tui::service::MovieBoxService;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{net::SocketAddr, sync::Arc, time::Duration};
use tokio::sync::Semaphore;

const MAX_PAGE: usize = 100;
const MAX_EPISODE: usize = 1000;
const MAX_ID_LEN: usize = 1024;
const MAX_QUERY_LEN: usize = 200;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Clone)]
struct AppState {
    service: Arc<MovieBoxService>,
    requests: Arc<Semaphore>,
}

#[derive(Debug, Serialize)]
struct ApiErrorBody {
    error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    provider: Option<String>,
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    message: String,
    provider: Option<String>,
}

impl ApiError {
    fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: message.into(),
            provider: None,
        }
    }

    fn provider(status: StatusCode, provider: ProviderKind, error: ProviderError) -> Self {
        Self {
            status,
            message: error.user_message(provider),
            provider: Some(provider.cache_key().to_string()),
        }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: message.into(),
            provider: None,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ApiErrorBody {
                error: self.message,
                provider: self.provider,
            }),
        )
            .into_response()
    }
}

#[derive(Debug, Deserialize)]
struct HomeQuery {
    provider: Option<String>,
    tab: Option<String>,
    page: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct SearchQuery {
    q: String,
    provider: Option<String>,
    page: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct StreamQuery {
    season: Option<usize>,
    episode: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct PlaybackRequest {
    provider: String,
    id: String,
    season: Option<usize>,
    episode: Option<usize>,
    #[serde(rename = "releaseIndex")]
    release_index: usize,
}

#[derive(Debug, Serialize)]
struct HomeResponse {
    items: Vec<moviebox_tui::providers::CatalogItem>,
    metrics: std::collections::HashMap<String, BrowseMetrics>,
    provider: String,
}

#[derive(Debug, Serialize)]
struct SearchResponse {
    items: Vec<moviebox_tui::providers::CatalogItem>,
    provider: String,
    page: usize,
}

#[derive(Debug, Serialize)]
struct ReleasesResponse {
    releases: Vec<Release>,
}

#[derive(Debug, Serialize)]
struct PlaybackResponse {
    url: String,
    headers: Vec<(String, String)>,
    #[serde(rename = "sourceLabel")]
    source_label: String,
    provider: ProviderKind,
}

fn enabled_provider(raw: &str) -> Result<ProviderKind, ApiError> {
    let provider = ProviderKind::parse(raw)
        .filter(|candidate| ProviderKind::ENABLED.contains(candidate))
        .ok_or_else(|| ApiError::bad_request(format!("unsupported provider: {raw}")))?;
    Ok(provider)
}

fn validate_id(id: &str) -> Result<(), ApiError> {
    let id = id.trim();
    if id.is_empty() || id.len() > MAX_ID_LEN || id.chars().any(|c| c.is_control()) {
        return Err(ApiError::bad_request(
            "id must be non-empty, at most 1024 characters, and contain no control characters",
        ));
    }
    Ok(())
}

fn validate_provider_id(provider: ProviderKind, id: &str) -> Result<(), ApiError> {
    validate_id(id)?;
    let id = id.trim();
    let safe_path = |path: &str| {
        let decoded = percent_encoding::percent_decode_str(path).decode_utf8_lossy();
        path.starts_with('/')
            && !path.chars().any(|ch| "?#\\".contains(ch))
            && decoded.starts_with('/')
            && !decoded
                .chars()
                .any(|ch| ch.is_control() || "?#\\".contains(ch))
            && path
                .split('/')
                .filter(|segment| !segment.is_empty())
                .all(|segment| {
                    segment != "."
                        && segment != ".."
                        && segment
                            .chars()
                            .all(|ch| ch.is_ascii_alphanumeric() || "-_.~%".contains(ch))
                })
            && decoded
                .split('/')
                .filter(|segment| !segment.is_empty())
                .all(|segment| segment != "." && segment != "..")
    };
    let safe = match provider {
        ProviderKind::MovieBox | ProviderKind::BdixCircleFtp => {
            !id.is_empty() && id.bytes().all(|byte| byte.is_ascii_digit())
        }
        ProviderKind::FourKHdHub => safe_path(id),
        ProviderKind::Dramachi => {
            let mut parts = id.split("::");
            let first = parts.next().unwrap_or_default();
            let second = parts.next();
            !first.is_empty()
                && parts.next().is_none()
                && [Some(first), second].into_iter().flatten().all(|part| {
                    !part.is_empty()
                        && part
                            .chars()
                            .all(|ch| ch.is_ascii_alphanumeric() || "-_.".contains(ch))
                })
        }
        ProviderKind::BdixDhakaFlix => {
            let allowed_base = [
                "http://172.16.50.7",
                "http://172.16.50.14",
                "http://172.16.50.12",
                "http://172.16.50.9",
            ];
            id.rsplit_once(':')
                .is_some_and(|(base, path)| allowed_base.contains(&base) && safe_path(path))
        }
        ProviderKind::Addons => false,
    };
    if !safe {
        return Err(ApiError::bad_request(
            "id does not match the selected provider's identifier format",
        ));
    }
    Ok(())
}

fn validate_query(query: &str) -> Result<&str, ApiError> {
    let query = query.trim();
    if query.is_empty() {
        return Err(ApiError::bad_request("q must not be empty"));
    }
    if query.len() > MAX_QUERY_LEN || query.chars().any(|c| c.is_control()) {
        return Err(ApiError::bad_request(
            "q must be at most 200 characters and contain no control characters",
        ));
    }
    Ok(query)
}

fn validate_page(page: Option<usize>) -> Result<usize, ApiError> {
    let page = page.unwrap_or(1);
    if !(1..=MAX_PAGE).contains(&page) {
        return Err(ApiError::bad_request("page must be between 1 and 100"));
    }
    Ok(page)
}

fn validate_episode(value: Option<usize>, name: &str) -> Result<usize, ApiError> {
    let value = value.unwrap_or(0);
    if value > MAX_EPISODE {
        return Err(ApiError::bad_request(format!(
            "{name} must be between 0 and {MAX_EPISODE}"
        )));
    }
    Ok(value)
}

async fn permit(state: &AppState) -> Result<tokio::sync::OwnedSemaphorePermit, ApiError> {
    state
        .requests
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError {
            status: StatusCode::TOO_MANY_REQUESTS,
            message: "the catalog is busy; retry shortly".to_string(),
            provider: None,
        })
}

async fn health() -> impl IntoResponse {
    Json(json!({ "status": "ok" }))
}

async fn providers() -> impl IntoResponse {
    Json(json!({
        "providers": ProviderKind::ENABLED.iter().map(|provider| json!({
            "id": provider.cache_key(),
            "label": provider.label(),
        })).collect::<Vec<_>>()
    }))
}

async fn home(
    State(state): State<Arc<AppState>>,
    Query(query): Query<HomeQuery>,
) -> Result<Json<HomeResponse>, ApiError> {
    let provider = enabled_provider(query.provider.as_deref().unwrap_or("moviebox"))?;
    let tab = query.tab.unwrap_or_else(|| "0".to_string());
    if tab.len() > 32 || tab.is_empty() || tab.chars().any(|c| !c.is_ascii_digit()) {
        return Err(ApiError::bad_request(
            "tab must be a numeric tab identifier",
        ));
    }
    let page = validate_page(query.page)?;
    let _permit = permit(&state).await?;
    if provider != ProviderKind::MovieBox {
        let mut items = tokio::time::timeout(
            REQUEST_TIMEOUT,
            state.service.search_typed(provider, "movie", page),
        )
        .await
        .map_err(|_| ApiError::internal("provider homepage request timed out"))?
        .map_err(|error| provider_error(provider, error))?;
        items.truncate(60);
        return Ok(Json(HomeResponse {
            items,
            metrics: std::collections::HashMap::new(),
            provider: provider.cache_key().to_string(),
        }));
    }
    let result = tokio::time::timeout(REQUEST_TIMEOUT, state.service.homepage(&tab, page))
        .await
        .map_err(|_| ApiError::internal("homepage request timed out"))?
        .map_err(|error| ApiError::internal(error.to_string()))?;
    let mut items = result.0;
    items.truncate(60);
    Ok(Json(HomeResponse {
        items,
        metrics: result.1,
        provider: provider.cache_key().to_string(),
    }))
}

async fn search(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<SearchResponse>, ApiError> {
    let q = validate_query(&query.q)?;
    let page = validate_page(query.page)?;
    let raw_provider = query.provider.as_deref().unwrap_or("all");
    let _permit = permit(&state).await?;
    if raw_provider.eq_ignore_ascii_case("all") {
        let mut items = Vec::new();
        let service = state.service.clone();
        let attempts = ProviderKind::ENABLED.into_iter().map(|provider| {
            let service = service.clone();
            async move {
                let result =
                    tokio::time::timeout(REQUEST_TIMEOUT, service.search_typed(provider, q, page))
                        .await;
                (provider, result)
            }
        });
        let mut successful_providers = 0;
        for (_provider, result) in futures::future::join_all(attempts).await {
            match result {
                Ok(Ok(mut provider_items)) => {
                    successful_providers += 1;
                    items.append(&mut provider_items);
                }
                Ok(Err(_)) | Err(_) => {}
            }
        }
        if successful_providers == 0 {
            return Err(ApiError {
                status: StatusCode::BAD_GATEWAY,
                message: "all catalog providers are temporarily unavailable".to_string(),
                provider: None,
            });
        }
        items.truncate(100);
        return Ok(Json(SearchResponse {
            items,
            provider: "all".to_string(),
            page,
        }));
    }
    let provider = enabled_provider(raw_provider)?;
    let result = tokio::time::timeout(
        REQUEST_TIMEOUT,
        state.service.search_typed(provider, q, page),
    )
    .await
    .map_err(|_| ApiError::internal("search request timed out"))?
    .map_err(|error| provider_error(provider, error))?;
    Ok(Json(SearchResponse {
        items: result,
        provider: provider.cache_key().to_string(),
        page,
    }))
}

async fn title(
    State(state): State<Arc<AppState>>,
    Path((raw_provider, id)): Path<(String, String)>,
) -> Result<Json<moviebox_tui::providers::MediaDetails>, ApiError> {
    let provider = enabled_provider(&raw_provider)?;
    validate_provider_id(provider, &id)?;
    let _permit = permit(&state).await?;
    let result = tokio::time::timeout(
        REQUEST_TIMEOUT,
        state.service.details_typed(provider, id.trim()),
    )
    .await
    .map_err(|_| ApiError::internal("details request timed out"))?
    .map_err(|error| provider_error(provider, error))?;
    Ok(Json(result))
}

async fn streams(
    State(state): State<Arc<AppState>>,
    Path((raw_provider, id)): Path<(String, String)>,
    Query(query): Query<StreamQuery>,
) -> Result<Json<ReleasesResponse>, ApiError> {
    let provider = enabled_provider(&raw_provider)?;
    validate_provider_id(provider, &id)?;
    let season = validate_episode(query.season, "season")?;
    let episode = validate_episode(query.episode, "episode")?;
    let _permit = permit(&state).await?;
    let result = tokio::time::timeout(
        REQUEST_TIMEOUT,
        releases_for(&state.service, provider, id.trim(), season, episode),
    )
    .await
    .map_err(|_| ApiError::internal("streams request timed out"))?
    .map_err(|error| provider_error(provider, error))?;
    Ok(Json(ReleasesResponse { releases: result }))
}

async fn playback(
    State(state): State<Arc<AppState>>,
    Json(request): Json<PlaybackRequest>,
) -> Result<Json<PlaybackResponse>, ApiError> {
    let provider = enabled_provider(&request.provider)?;
    validate_provider_id(provider, &request.id)?;
    let season = validate_episode(request.season, "season")?;
    let episode = validate_episode(request.episode, "episode")?;
    let _permit = permit(&state).await?;
    let releases = tokio::time::timeout(
        REQUEST_TIMEOUT,
        releases_for(&state.service, provider, request.id.trim(), season, episode),
    )
    .await
    .map_err(|_| ApiError::internal("streams request timed out"))?
    .map_err(|error| provider_error(provider, error))?;
    let release = releases
        .get(request.release_index)
        .ok_or_else(|| ApiError::bad_request("releaseIndex is out of range"))?;
    let playback = tokio::time::timeout(
        REQUEST_TIMEOUT,
        resolve_playback(&state.service, provider, release),
    )
    .await
    .map_err(|_| ApiError::internal("playback resolution timed out"))?
    .map_err(|error| provider_error(provider, error))?;
    Ok(Json(PlaybackResponse {
        url: playback.0,
        headers: playback.1,
        source_label: playback.2,
        provider,
    }))
}

async fn releases_for(
    service: &MovieBoxService,
    provider: ProviderKind,
    id: &str,
    season: usize,
    episode: usize,
) -> Result<Vec<Release>, ProviderError> {
    match provider {
        ProviderKind::MovieBox => service.client.episode_streams(id, season, episode).await,
        ProviderKind::FourKHdHub => {
            service
                .fourk_client
                .as_ref()
                .ok_or_else(|| ProviderError::Unavailable("4KHDHub is unavailable".to_string()))?
                .episode_streams(id, season, episode)
                .await
        }
        ProviderKind::Dramachi => service
            .dramachi_client
            .episode_streams(id, season, episode)
            .await
            .map_err(ProviderError::from),
        ProviderKind::BdixCircleFtp => {
            service
                .circleftp_client
                .episode_streams(id, season, episode)
                .await
        }
        ProviderKind::BdixDhakaFlix => {
            service
                .dhakaflix_client
                .episode_streams(id, season, episode)
                .await
        }
        ProviderKind::Addons => Err(ProviderError::Unavailable(
            "addons are not an enabled API provider".to_string(),
        )),
    }
}

async fn resolve_playback(
    service: &MovieBoxService,
    provider: ProviderKind,
    release: &Release,
) -> Result<(String, Vec<(String, String)>, String), ProviderError> {
    if provider == ProviderKind::FourKHdHub {
        let fourk = service
            .fourk_client
            .as_ref()
            .ok_or_else(|| ProviderError::Unavailable("4KHDHub is unavailable".to_string()))?;
        let source = fourk
            .resolve_release(release, ResolutionIntent::Playback)
            .await
            .map_err(ProviderError::from)?;
        return Ok((source.url, source.headers, source.source_label));
    }
    let mirror = release
        .mirrors
        .iter()
        .find(|mirror| {
            mirror.resolver_url.starts_with("https://")
                || mirror.resolver_url.starts_with("http://")
        })
        .ok_or_else(|| ProviderError::Unavailable("release has no playable URL".to_string()))?;
    Ok((
        mirror.resolver_url.clone(),
        mirror.headers.clone(),
        mirror.label.clone(),
    ))
}

fn provider_error(provider: ProviderKind, error: ProviderError) -> ApiError {
    let status = match error {
        ProviderError::NotFound => StatusCode::NOT_FOUND,
        ProviderError::RateLimited(_) => StatusCode::TOO_MANY_REQUESTS,
        ProviderError::Network(_) | ProviderError::Unavailable(_) | ProviderError::Parsing(_) => {
            StatusCode::BAD_GATEWAY
        }
    };
    ApiError::provider(status, provider, error)
}

fn app(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/health", get(health))
        .route("/api/providers", get(providers))
        .route("/api/home", get(home))
        .route("/api/search", get(search))
        .route("/api/titles/{provider}/{id}", get(title))
        .route("/api/streams/{provider}/{id}", get(streams))
        .route("/api/playback", post(playback))
        .with_state(state)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let port = std::env::var("PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(3001);
    let state = Arc::new(AppState {
        service: Arc::new(MovieBoxService::new()),
        requests: Arc::new(Semaphore::new(8)),
    });
    let address = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(address).await?;
    println!("wellcinebox-api listening on http://{address}");
    axum::serve(listener, app(state)).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_aliases_are_limited_to_enabled_providers() {
        assert_eq!(
            enabled_provider("4khdhub").unwrap(),
            ProviderKind::FourKHdHub
        );
        assert!(enabled_provider("addons").is_err());
        assert!(enabled_provider("all").is_err());
    }

    #[test]
    fn validation_rejects_bad_bounds() {
        assert!(validate_page(Some(0)).is_err());
        assert!(validate_page(Some(101)).is_err());
        assert!(validate_episode(Some(MAX_EPISODE + 1), "episode").is_err());
        assert!(validate_query("\n").is_err());
    }

    #[test]
    fn provider_ids_are_scoped_to_their_source() {
        assert!(validate_provider_id(ProviderKind::MovieBox, "6830503706115863056").is_ok());
        assert!(validate_provider_id(ProviderKind::FourKHdHub, "/movies/example-2026/").is_ok());
        assert!(validate_provider_id(ProviderKind::FourKHdHub, "/../private").is_err());
        assert!(
            validate_provider_id(
                ProviderKind::BdixDhakaFlix,
                "http://172.16.50.7:/DHAKA-FLIX-7/movie.mkv"
            )
            .is_ok()
        );
        assert!(
            validate_provider_id(
                ProviderKind::BdixDhakaFlix,
                "http://169.254.169.254:/latest/meta-data"
            )
            .is_err()
        );
        assert!(
            validate_provider_id(
                ProviderKind::BdixDhakaFlix,
                "http://172.16.50.7:/DHAKA-FLIX-7/%2e%2e/secret"
            )
            .is_err()
        );
    }
}
