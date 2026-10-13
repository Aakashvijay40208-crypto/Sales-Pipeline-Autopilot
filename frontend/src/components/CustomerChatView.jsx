import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Bot,
  User,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Building2
} from 'lucide-react';

export default function CustomerChatView({ token, backendUrl }) {
  const [chatData, setChatData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    async function loadChat() {
      try {
        const res = await fetch(`${backendUrl}/api/public/chat/${token}`);
        if (res.ok) {
          const data = await res.json();
          setChatData(data);
          setMessages(data.messages || []);
        } else {
          const err = await res.json();
          setError(err.error || 'This conversation link is invalid or has expired.');
        }
      } catch (e) {
        setError('Failed to connect to the conversation server.');
      } finally {
        setLoading(false);
      }
    }
    if (token) loadChat();
  }, [token, backendUrl]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || sending) return;

    const userMsgText = inputValue.trim();
    setInputValue('');

    // Optimistically append customer message
    const tempMsg = {
      id: Date.now().toString(),
      sender_type: 'customer',
      sender_name: 'You',
      content: userMsgText,
      timestamp: new Date().toISOString()
    };
    setMessages((prev) => [...prev, tempMsg]);
    setSending(true);

    try {
      const res = await fetch(`${backendUrl}/api/public/chat/${token}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsgText })
      });

      if (res.ok) {
        const data = await res.json();
        const aiMsg = {
          id: (Date.now() + 1).toString(),
          sender_type: 'ai_agent',
          sender_name: 'Digital Solutions Specialist',
          content: data.reply,
          timestamp: new Date().toISOString()
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        alert("Failed to deliver message. Please try again.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div style={fullScreenCenterStyle}>
        <RefreshCw size={28} className="spin-loader" color="var(--primary)" />
        <span style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '12px' }}>
          Opening private consultation chat...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={fullScreenCenterStyle}>
        <div className="card-surface" style={{ padding: '36px', maxWidth: '440px', textAlign: 'center' }}>
          <AlertCircle size={36} color="var(--danger)" style={{ marginBottom: '12px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
            Access Restricted
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
            {error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={chatPageContainerStyle}>
      {/* Client Header */}
      <div style={chatHeaderStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={clientAvatarStyle}>
            <Building2 size={20} color="var(--primary)" />
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {chatData?.business_name || 'Business Consultation'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={13} color="var(--success)" /> Verified Private Consultation Session
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
          <Sparkles size={14} color="var(--primary)" />
          <span>Powered by Autopilot</span>
        </div>
      </div>

      {/* Messages Stream */}
      <div style={messagesAreaStyle}>
        {/* Welcome greeting */}
        <div style={{ ...aiMessageCardStyle, alignSelf: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--primary)', marginBottom: '4px' }}>
            <Bot size={14} /> Digital Solutions Specialist
          </div>
          <div style={{ fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)' }}>
            Hello! Welcome to your dedicated project consultation channel for <strong>{chatData?.business_name}</strong>.
            Feel free to ask any questions about our website modernization packages, mobile optimization, SEO, delivery turnaround times, or appointment booking integrations.
          </div>
        </div>

        {messages.map((m) => {
          const isCustomer = m.sender_type === 'customer';
          return (
            <div
              key={m.id}
              style={{
                alignSelf: isCustomer ? 'flex-end' : 'flex-start',
                maxWidth: '75%',
                backgroundColor: isCustomer ? 'var(--primary)' : '#FFFFFF',
                color: isCustomer ? '#FFFFFF' : 'var(--text-primary)',
                border: isCustomer ? 'none' : '1px solid var(--border)',
                borderRadius: '12px',
                padding: '12px 16px',
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              {!isCustomer && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--primary)', marginBottom: '4px' }}>
                  <Bot size={13} /> {m.sender_name || 'Specialist'}
                </div>
              )}
              <div style={{ fontSize: '14px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {m.content}
              </div>
            </div>
          );
        })}

        {sending && (
          <div style={{ ...aiMessageCardStyle, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RefreshCw size={14} className="spin-loader" color="var(--primary)" />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Specialist is preparing response...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSendMessage} style={chatInputFormStyle}>
        <input
          type="text"
          placeholder="Ask a question about project scopes, pricing, or timelines..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={sending}
          style={{ flex: 1, padding: '12px 16px', fontSize: '14px' }}
        />
        <button
          type="submit"
          disabled={sending || !inputValue.trim()}
          className="btn-primary"
          style={{ height: '46px', padding: '0 20px' }}
        >
          <Send size={16} /> Send
        </button>
      </form>
    </div>
  );
}

const fullScreenCenterStyle = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'var(--page-background)',
};

const chatPageContainerStyle = {
  maxWidth: '760px',
  margin: '0 auto',
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: 'var(--surface)',
  boxShadow: 'var(--shadow-lg)',
};

const chatHeaderStyle = {
  padding: '16px 24px',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  backgroundColor: 'var(--surface)',
};

const clientAvatarStyle = {
  width: '40px',
  height: '40px',
  borderRadius: '10px',
  backgroundColor: 'var(--surface-soft)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid #D1E1FF',
};

const messagesAreaStyle = {
  flex: 1,
  overflowY: 'auto',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  backgroundColor: 'var(--page-background)',
};

const aiMessageCardStyle = {
  backgroundColor: '#FFFFFF',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '14px 18px',
  maxWidth: '80%',
  boxShadow: 'var(--shadow-sm)',
};

const chatInputFormStyle = {
  padding: '16px 20px',
  borderTop: '1px solid var(--border)',
  display: 'flex',
  gap: '10px',
  backgroundColor: 'var(--surface)',
};
