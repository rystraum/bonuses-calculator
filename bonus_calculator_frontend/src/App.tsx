import { Routes, Route } from 'react-router'
import { StoreProvider } from '@/lib/store'
import { RequireAuth } from '@/components/chrome'
import Login from '@/pages/Login'
import Distributions from '@/pages/Distributions'
import DistributionDetail from '@/pages/DistributionDetail'
import Shareholders from '@/pages/Shareholders'
import Employees from '@/pages/Employees'
import Compare from '@/pages/Compare'
import Import from '@/pages/Import'

export default function App() {
  return (
    <StoreProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><Distributions /></RequireAuth>} />
        <Route path="/distributions/:id" element={<RequireAuth><DistributionDetail /></RequireAuth>} />
        <Route path="/compare" element={<RequireAuth><Compare /></RequireAuth>} />
        <Route path="/shareholders" element={<RequireAuth><Shareholders /></RequireAuth>} />
        <Route path="/employees" element={<RequireAuth><Employees /></RequireAuth>} />
        <Route path="/import" element={<RequireAuth><Import /></RequireAuth>} />
        <Route path="*" element={<RequireAuth><Distributions /></RequireAuth>} />
      </Routes>
    </StoreProvider>
  )
}
