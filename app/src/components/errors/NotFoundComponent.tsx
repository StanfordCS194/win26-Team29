import { Link } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export function NotFoundComponent() {
  return (
    <main className="flex min-h-[calc(100vh-var(--header-height))] items-center justify-center px-4 py-8">
      <Card className="max-w-lg text-center">
        <CardHeader>
          <CardTitle className="text-4xl font-bold text-muted-foreground">404</CardTitle>
          <CardDescription className="text-base">Page not found</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Button render={<Link to="/" />} variant="default">
            Go home
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
