import { Link, useRouter } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { useState } from 'react'

import Header from '@/components/Header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)

  const handleTryAgain = async () => {
    setRetrying(true)
    try {
      reset()
      await router.invalidate()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <>
      <Header />
      <main className="fixed inset-0 flex items-center justify-center px-4 py-8">
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle className="text-destructive">Something went wrong</CardTitle>
            <CardDescription>
              An unexpected error occurred. You can try again or return to the home page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
              {error.message}
            </pre>
          </CardContent>
          <CardFooter className="flex gap-3">
            <Button
              onClick={() => {
                void handleTryAgain()
              }}
              variant="default"
              disabled={retrying}
            >
              {retrying ? 'Retrying…' : 'Try again'}
            </Button>
            <Button render={<Link to="/" />} variant="outline">
              Go home
            </Button>
          </CardFooter>
        </Card>
      </main>
    </>
  )
}
