// ---------------------------------------------------------------------------
// Donde llega el enlace de "Compartir enlace": /amigo/K7Q2XM9P.
//
// Abre la app con el codigo ya buscado, para que mandar la solicitud sea un
// toque. Si no hay sesion, la puerta de entrada pide iniciarla primero y al
// volver se sigue en esta misma pantalla.
// ---------------------------------------------------------------------------

import { useNavigate, useParams } from 'react-router-dom'
import { isCloudEnabled } from '../db/firebase'
import { formatFriendCode, normalizeFriendCode } from '../lib/social'
import { useAuth } from '../components/AuthProvider'
import { AddFriend } from '../components/Friends'
import { PageHeader } from '../components/Layout'
import { Button, Card, Empty } from '../components/ui'

export default function AddFriendLink() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const auth = useAuth()

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Añadir amigo" onBack={() => navigate('/social')} />

      <div className="px-4 pb-8 md:px-8">
        {!isCloudEnabled() ? (
          <Empty title="Social necesita la nube" hint="Esta copia funciona en modo local, sin cuentas." />
        ) : auth.status !== 'dentro' ? (
          <Empty
            title="Inicia sesión para añadir a tu amigo"
            action={<Button variant="primary" onClick={() => navigate('/entrar')}>Iniciar sesión</Button>}
          />
        ) : (
          <Card className="space-y-4 p-5">
            <p className="text-sm text-ink-500">
              Te han pasado este código de amigo. Envía la solicitud y, cuando la acepte, veréis
              los entrenos y los rangos del otro.
            </p>
            <AddFriend initialCode={formatFriendCode(normalizeFriendCode(code))} autoSearch />
          </Card>
        )}
      </div>
    </div>
  )
}
