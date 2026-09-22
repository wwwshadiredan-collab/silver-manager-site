import { HashRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AuthGate } from './components/AuthGate'
import { Login } from './pages/Login'
import { SetupShop } from './pages/SetupShop'
import { Dashboard } from './pages/Dashboard'
import { Inventory } from './pages/Inventory'
import { ItemForm } from './pages/ItemForm'
import { POS } from './pages/POS'
import { Contacts } from './pages/Contacts'
import { Expenses } from './pages/Expenses'
import { Assistant } from './pages/Assistant'
import { ArchivePage } from './pages/Archive'
import { Diagnostics } from './pages/Diagnostics'
import { Settings } from './pages/Settings'
import { Audit } from './pages/Audit'
import { Purchases } from './pages/Purchases'
import { Buyback } from './pages/Buyback'
import { Repairs } from './pages/Repairs'
import { Refining } from './pages/Refining'
import { Reports } from './pages/Reports'
import { Cash } from './pages/Cash'
import { Accounts } from './pages/Accounts'
import { Stocktake } from './pages/Stocktake'

export default function App(){
  return <HashRouter><Routes>
    <Route path="/login" element={<Login/>}/>
    <Route path="/setup" element={<SetupShop/>}/>
    <Route element={<AuthGate><Layout/></AuthGate>}>
      <Route path="/" element={<Dashboard/>}/>
      <Route path="/pos" element={<POS/>}/>
      <Route path="/inventory" element={<Inventory/>}/>
      <Route path="/inventory/new" element={<ItemForm/>}/>
      <Route path="/inventory/:id/edit" element={<ItemForm/>}/>
      <Route path="/customers" element={<Contacts type="customers"/>}/>
      <Route path="/suppliers" element={<Contacts type="suppliers"/>}/>
      <Route path="/expenses" element={<Expenses/>}/>
      <Route path="/assistant" element={<Assistant/>}/>
      <Route path="/archive" element={<ArchivePage/>}/>
      <Route path="/diagnostics" element={<Diagnostics/>}/>
      <Route path="/settings" element={<Settings/>}/>
      <Route path="/audit" element={<Audit/>}/>
      <Route path="/purchases" element={<Purchases/>}/>
      <Route path="/buyback" element={<Buyback/>}/>
      <Route path="/refining" element={<Refining/>}/>
      <Route path="/repairs" element={<Repairs/>}/>
      <Route path="/cash" element={<Cash/>}/>
      <Route path="/accounts" element={<Accounts/>}/>
      <Route path="/reports" element={<Reports/>}/>
      <Route path="/stocktake" element={<Stocktake/>}/>
    </Route>
  </Routes></HashRouter>
}
