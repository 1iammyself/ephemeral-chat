use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::UdpSocket;
use tokio::sync::Mutex;

pub struct MasqueInner {
    pub ready: bool,
    pub proxy_url: Option<String>,
    pub socket: Option<Arc<UdpSocket>>,
}

pub struct MasqueState(pub Arc<Mutex<MasqueInner>>);

impl Default for MasqueState {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(MasqueInner {
            ready: false,
            proxy_url: None,
            socket: None,
        })))
    }
}

impl MasqueState {
    pub async fn init(&self, proxy_url: String) -> Result<(), String> {
        let socket = UdpSocket::bind("0.0.0.0:0")
            .await
            .map_err(|e| e.to_string())?;

        let mut inner = self.0.lock().await;
        inner.proxy_url = Some(proxy_url);
        inner.socket = Some(Arc::new(socket));
        inner.ready = true;
        Ok(())
    }

    pub async fn is_available(&self) -> bool {
        self.0.lock().await.ready
    }

    pub async fn send(&self, target: &str, payload: &[u8]) -> Result<(bool, bool), String> {
        let inner = self.0.lock().await;
        if !inner.ready {
            return Err("MASQUE not initialized".to_string());
        }
        let socket = inner.socket.as_ref()
            .ok_or_else(|| "No UDP socket".to_string())?
            .clone();
        drop(inner);

        // Parse target as "host:port"
        let addr: SocketAddr = target.parse().map_err(|e| format!("invalid target: {}", e))?;
        socket.send_to(payload, addr).await.map_err(|e| e.to_string())?;
        Ok((true, false)) // (success, tunneled) — not proxied, direct UDP
    }
}
