// ---------------------------------------------------------------------------
// Perfil de un amigo: su actividad, su muneco de rangos con los seis grupos y
// el boton para compararlos con los tuyos.
//
// Sus rangos no se calculan aqui con sus entrenos, que no se pueden leer:
// llegan ya calculados en publicStats y solo se les aplica el abandono de las
// semanas que hayan pasado desde que los publico. Los tuyos salen de tu
// historial, igual que en Progreso.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { dateKey } from '../db/repo'
import { buildWeekMuscleData } from '../db/rank-data'
import { fetchPublicStats, isPermissionDenied, removeFriendship, socialErrorEs } from '../db/social'
import { computeMuscleRanks, weekKeyOf } from '../lib/ranks'
import { activityFromPublic, ranksFromPublic, type PublicStats } from '../lib/social'
import { useSocial } from '../components/SocialProvider'
import Avatar from '../components/Avatar'
import RankComparison from '../components/RankComparison'
import { PageHeader } from '../components/Layout'
import { Button, Card, Empty } from '../components/ui'

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-ink-500">{label}</p>
    </div>
  )
}

export default function FriendProfile() {
  const { friendUid = '' } = useParams()
  const navigate = useNavigate()
  const social = useSocial()
  const entry = social.lists.friends.find(f => f.uid === friendUid)
  const profile = social.profiles.get(friendUid)
  const name = profile?.displayName ?? 'Tu amigo'

  const [stats, setStats] = useState<PublicStats | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!social.enabled || !friendUid) return
    let cancelled = false
    setStats(undefined)
    setError(null)

    fetchPublicStats(friendUid)
      .then(result => { if (!cancelled) setStats(result) })
      .catch(e => {
        if (cancelled) return
        setError(isPermissionDenied(e) ? 'Solo puedes ver el perfil de tus amigos.' : socialErrorEs(e))
      })
    void social.refreshProfiles([friendUid])

    return () => { cancelled = true }
  }, [social.enabled, friendUid])

  const week = weekKeyOf(new Date())
  const theirs = useMemo(() => (stats ? ranksFromPublic(stats, week) : []), [stats, week])
  const weekData = useLiveQuery(() => buildWeekMuscleData(), [], [])
  const mine = useMemo(() => computeMuscleRanks(weekData ?? [], week), [weekData, week])
  const activity = stats ? activityFromPublic(stats, dateKey()) : null

  async function remove() {
    if (!entry) return
    if (!confirm(`¿Eliminar a ${name} de tus amigos? Dejaréis de ver los entrenos del otro.`)) return
    try {
      await removeFriendship(entry.friendship)
      navigate('/social')
    } catch (e) {
      setError(socialErrorEs(e))
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={name} onBack={() => navigate('/social')} />

      <div className="space-y-4 px-4 pb-8 md:px-8">
        <Card className="flex items-center gap-4 p-5">
          <Avatar name={name} url={profile?.avatarUrl} size={64} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-semibold">{name}</p>
            {entry?.friendship.acceptedAt && (
              <p className="text-sm text-ink-500">
                Amigos desde el {new Date(entry.friendship.acceptedAt).toLocaleDateString('es-ES', {
                  day: 'numeric', month: 'long', year: 'numeric'
                })}
              </p>
            )}
          </div>
        </Card>

        {error ? (
          <Empty
            title={error}
            action={<Button variant="outline" onClick={() => navigate('/social')}>Volver a Social</Button>}
          />
        ) : stats === undefined ? (
          <p className="animate-pulse py-16 text-center text-ink-500">Cargando…</p>
        ) : stats === null ? (
          <Empty
            title="Todavía no ha publicado sus rangos"
            hint="Saldrán en cuanto abra la app con sesión iniciada y se sincronice."
          />
        ) : (
          <>
            {activity && (
              <Card className="p-5">
                <p className="mb-4 text-sm text-ink-500">Actividad</p>
                <div className="grid grid-cols-3 gap-2">
                  <Stat value={String(activity.workouts)} label="entrenos" />
                  <Stat value={String(activity.streak)} label="racha" />
                  <Stat value={String(activity.best)} label="mejor racha" />
                </div>
              </Card>
            )}

            <RankComparison name={name.split(/\s+/)[0]} theirs={theirs} mine={mine} />
          </>
        )}

        {entry && (
          <div className="pt-2 text-center">
            <Button variant="ghost" size="sm" onClick={() => void remove()}>Eliminar de mis amigos</Button>
          </div>
        )}
      </div>
    </div>
  )
}
