import type { ReactNode } from 'react'
import { MomentumWordmark } from '@/components/shared/Logo'

/** The signed-out card the sign-in page uses, for Forgot password and Reset password. */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ background: 'var(--rail)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: 'var(--panel)', borderRadius: '16px', padding: '40px 32px', width: '100%', maxWidth: '400px', boxShadow: '0 4px 32px rgba(0,0,0,0.18)' }}>
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <MomentumWordmark fontSize={26} />
          <h1 style={{ margin: '14px 0 0', fontSize: '18px', fontWeight: 700, color: 'var(--ink)' }}>{title}</h1>
        </div>
        {children}
      </div>
    </div>
  )
}

export const authInput: React.CSSProperties = {
  padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--line)', fontSize: '14px',
  outline: 'none', fontFamily: 'inherit', color: 'var(--ink)', background: '#F6F6F4', width: '100%', boxSizing: 'border-box',
}

export const authButton = (busy: boolean): React.CSSProperties => ({
  background: 'var(--lime)', color: 'var(--ink)', borderRadius: '10px', padding: '14px 24px', width: '100%',
  fontFamily: 'inherit', fontWeight: 700, fontSize: '15px', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1,
})

export const authNote = (tone: 'ok' | 'error' | 'warn'): React.CSSProperties => ({
  background: tone === 'ok' ? '#E8F5E0' : tone === 'warn' ? '#FCEFD9' : '#F8E7E5',
  color: tone === 'ok' ? '#3C6E1F' : tone === 'warn' ? '#8A6414' : '#C0453E',
  borderRadius: '8px', padding: '12px 16px', fontSize: '14px', lineHeight: 1.5, marginBottom: '16px',
})

export const authLink: React.CSSProperties = { color: 'var(--ink)', fontSize: '13px', fontWeight: 600, textDecoration: 'underline' }
