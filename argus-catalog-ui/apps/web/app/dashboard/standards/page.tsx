"use client"

import { useCallback, useContext, useEffect, useMemo, useRef, useState, createContext } from "react"
import { AgGridReact } from "ag-grid-react"
import { AllCommunityModule, ModuleRegistry, type ColDef, type CellValueChangedEvent } from "ag-grid-community"
import { DashboardHeader } from "@/components/dashboard-header"

ModuleRegistry.registerModules([AllCommunityModule])
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@workspace/ui/components/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@workspace/ui/components/table"
import { Plus, Trash2, Search, BookOpen, Type, Grid3X3, FileCode, Hash, ArrowRight, Upload } from "lucide-react"
import { authFetch } from "@/features/auth/auth-fetch"

const BASE = "/api/v1/standards"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Dictionary = {
  id: number; dict_name: string; description: string | null; version: string | null
  status: string; word_count: number; domain_count: number; term_count: number; code_group_count: number
}

type Word = {
  id: number; dictionary_id: number; word_name: string; word_english: string; word_abbr: string
  description: string | null; word_type: string; is_forbidden: string; status: string
}

type Domain = {
  id: number; dictionary_id: number; domain_name: string; domain_group: string | null
  data_type: string; data_length: number | null; data_precision: number | null; data_scale: number | null
  description: string | null; code_group_name: string | null; status: string
}

type TermWord = { word_id: number; word_name: string; word_abbr: string; word_type: string; ordinal: number }

type Term = {
  id: number; dictionary_id: number; term_name: string; term_english: string; term_abbr: string
  physical_name: string; domain_name: string | null; domain_data_type: string | null
  description: string | null; status: string; words: TermWord[]; mapping_count: number
}

type CodeGroup = {
  id: number; group_name: string; group_english: string | null; status: string
  values: { id: number; code_value: string; code_name: string; code_english: string | null }[]
}

type MorphemeResult = {
  words: TermWord[]; term_english: string; term_abbr: string; physical_name: string
  recommended_domain: Domain | null; unmatched_parts: string[]
}

type ComplianceStats = {
  total_columns: number; matched: number; similar: number; violation: number
  unmapped: number; compliance_rate: number
}

type BulkResult = {
  total: number; created: number; failed: number
  ids: number[]; errors: { index: number; error: string }[]
}

// ---------------------------------------------------------------------------
// Bulk import button (CSV/XLSX → POST /import-file) — 단건 입력 보완
// ---------------------------------------------------------------------------

function ImportButton(
  { kind, dictId, onImported }:
  { kind: "word" | "domain" | "term" | "code"; dictId: number; onImported: () => void }
) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<BulkResult | null>(null)

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""  // 같은 파일 재선택 허용
    if (!file) return
    setBusy(true)
    const fd = new FormData()
    fd.append("kind", kind)
    fd.append("dictionary_id", String(dictId))
    fd.append("file", file)
    try {
      const r = await authFetch(`${BASE}/import-file`, { method: "POST", body: fd })
      if (r.ok) {
        setResult(await r.json() as BulkResult)
        onImported()
      } else {
        const txt = await r.text()
        setResult({ total: 0, created: 0, failed: 0, ids: [], errors: [{ index: -1, error: `HTTP ${r.status}: ${txt}` }] })
      }
    } catch (err) {
      setResult({ total: 0, created: 0, failed: 0, ids: [], errors: [{ index: -1, error: String(err) }] })
    } finally {
      setBusy(false)
      setOpen(true)
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={onFile} />
      <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        <Upload className="h-3.5 w-3.5 mr-1" />{busy ? "Importing..." : "Import"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Import result</DialogTitle></DialogHeader>
          {result && (
            <div className="space-y-2 text-sm">
              <div className="flex gap-4">
                <span>Total: <b>{result.total}</b></span>
                <span className="text-green-600">Created: <b>{result.created}</b></span>
                <span className={result.failed ? "text-red-600" : undefined}>Failed: <b>{result.failed}</b></span>
              </div>
              {result.errors.length > 0 && (
                <div className="max-h-60 overflow-auto rounded border p-2 font-mono text-xs space-y-1">
                  {result.errors.map((er, i) => (
                    <div key={i} className="text-red-600">
                      {er.index >= 0 ? `row ${er.index}: ` : ""}{er.error}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                헤더 행 필요 — 예: 단어명/영문명/영문약어 · 도메인명/데이터유형/길이 · 용어명/영문명 · 코드그룹/코드값/코드값명
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StandardsPage() {
  const [dictionaries, setDictionaries] = useState<Dictionary[]>([])
  const [selectedDictId, setSelectedDictId] = useState<number | null>(null)
  const [tab, setTab] = useState("words")
  const [dictDialogOpen, setDictDialogOpen] = useState(false)

  const fetchDicts = useCallback(async () => {
    const resp = await authFetch(`${BASE}/dictionaries`)
    if (resp.ok) {
      const data = await resp.json()
      setDictionaries(data)
      if (data.length > 0 && !selectedDictId) setSelectedDictId(data[0].id)
    }
  }, [selectedDictId])

  useEffect(() => { fetchDicts() }, [fetchDicts])

  const selectedDict = dictionaries.find(d => d.id === selectedDictId)

  return (
    <>
      <DashboardHeader title="Data Standards" />
      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Dictionary selector */}
        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium">Dictionary:</Label>
          <Select
            value={selectedDictId ? String(selectedDictId) : ""}
            onValueChange={v => setSelectedDictId(Number(v))}
          >
            <SelectTrigger className="w-72 h-9">
              <SelectValue placeholder="Select dictionary..." />
            </SelectTrigger>
            <SelectContent>
              {dictionaries.map(d => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {d.dict_name}
                  {d.version && <span className="text-muted-foreground ml-1">({d.version})</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setDictDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> New Dictionary
          </Button>

          {selectedDict && (
            <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
              <span>Words: <span className="text-foreground font-medium">{selectedDict.word_count}</span></span>
              <span>Domains: <span className="text-foreground font-medium">{selectedDict.domain_count}</span></span>
              <span>Terms: <span className="text-foreground font-medium">{selectedDict.term_count}</span></span>
              <span>Codes: <span className="text-foreground font-medium">{selectedDict.code_group_count}</span></span>
            </div>
          )}
        </div>

        {selectedDictId && (
          <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col min-h-0">
            <TabsList>
              <TabsTrigger value="words"><Type className="h-3.5 w-3.5 mr-1" />Words</TabsTrigger>
              <TabsTrigger value="domains"><Grid3X3 className="h-3.5 w-3.5 mr-1" />Domains</TabsTrigger>
              <TabsTrigger value="terms"><FileCode className="h-3.5 w-3.5 mr-1" />Terms</TabsTrigger>
              <TabsTrigger value="codes"><Hash className="h-3.5 w-3.5 mr-1" />Codes</TabsTrigger>
              <TabsTrigger value="compliance"><BookOpen className="h-3.5 w-3.5 mr-1" />Compliance</TabsTrigger>
            </TabsList>

            <TabsContent value="words" className="mt-4 flex-1 flex flex-col min-h-0 h-0">
              <WordsTab dictId={selectedDictId} />
            </TabsContent>
            <TabsContent value="domains" className="mt-4 flex-1 flex flex-col min-h-0 h-0">
              <DomainsTab dictId={selectedDictId} />
            </TabsContent>
            <TabsContent value="terms" className="mt-4 flex-1 flex flex-col min-h-0 h-0">
              <TermsTab dictId={selectedDictId} />
            </TabsContent>
            <TabsContent value="codes" className="mt-4 flex-1 flex flex-col min-h-0 h-0">
              <CodesTab dictId={selectedDictId} />
            </TabsContent>
            <TabsContent value="compliance" className="mt-4">
              <ComplianceTab dictId={selectedDictId} />
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* New Dictionary Dialog */}
      <DictionaryDialog open={dictDialogOpen} onOpenChange={setDictDialogOpen} onCreated={fetchDicts} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Dictionary Dialog
// ---------------------------------------------------------------------------

function DictionaryDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState("")
  const [version, setVersion] = useState("")
  const [desc, setDesc] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) { setName(""); setVersion(""); setDesc("") } }, [open])

  const save = async () => {
    setSaving(true)
    await authFetch(`${BASE}/dictionaries`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dict_name: name, version: version || null, description: desc || null }),
    })
    setSaving(false)
    onCreated()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Dictionary</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Name</Label><Input value={name} onChange={e => setName(e.target.value)} className="h-9" /></div>
          <div><Label className="text-xs">Version</Label><Input value={version} onChange={e => setVersion(e.target.value)} placeholder="v1.0" className="h-9" /></div>
          <div><Label className="text-xs">Description</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} /></div>
          <div className="flex justify-end"><Button onClick={save} disabled={saving || !name.trim()}>{saving ? "Saving..." : "Create"}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Words Tab (AG Grid — inline row editing)
// ---------------------------------------------------------------------------

// Context for delete handler
const WordDeleteCtx = createContext<(id: number) => void>(() => {})

function WordDeleteRenderer(props: { value: number }) {
  const onDelete = useContext(WordDeleteCtx)
  return (
    <button
      type="button"
      onClick={() => onDelete(props.value)}
      className="flex items-center justify-center w-full h-full text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}

function WordsTab({ dictId }: { dictId: number }) {
  const [words, setWords] = useState<Word[]>([])
  const gridRef = useRef<AgGridReact>(null)

  const fetchWords = useCallback(async () => {
    const r = await authFetch(`${BASE}/words?dictionary_id=${dictId}`)
    if (r.ok) setWords(await r.json())
  }, [dictId])
  useEffect(() => { fetchWords() }, [fetchWords])

  // Add new empty row
  const addWord = useCallback(async () => {
    const resp = await authFetch(`${BASE}/words`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dictionary_id: dictId,
        word_name: "(new)",
        word_english: "(new)",
        word_abbr: "NEW",
        word_type: "GENERAL",
      }),
    })
    if (resp.ok) {
      await fetchWords()
      // Focus the new row for editing
      setTimeout(() => {
        const api = gridRef.current?.api
        if (api) {
          const lastIdx = words.length  // after fetch, this is the new last row
          api.ensureIndexVisible(lastIdx)
          api.startEditingCell({ rowIndex: lastIdx, colKey: "word_name" })
        }
      }, 200)
    }
  }, [dictId, fetchWords, words.length])

  // Delete row
  const deleteWord = useCallback(async (id: number) => {
    await authFetch(`${BASE}/words/${id}`, { method: "DELETE" })
    fetchWords()
  }, [fetchWords])

  // Save on cell edit
  const onCellValueChanged = useCallback(async (event: CellValueChangedEvent) => {
    const { data, colDef, newValue, oldValue } = event
    if (newValue === oldValue) return

    const field = colDef.field
    if (!field || !data.id) return

    await authFetch(`${BASE}/words/${data.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: newValue }),
    })
  }, [])

  const columnDefs = useMemo<ColDef[]>(() => [
    {
      headerName: "#",
      valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1,
      width: 50, maxWidth: 55,
      editable: false,
      sortable: false,
      cellStyle: { color: "#9ca3af", textAlign: "right" },
    },
    {
      headerName: "Name (한글)",
      field: "word_name",
      minWidth: 120,
      editable: true,
      cellStyle: { fontWeight: 500 },
    },
    {
      headerName: "English",
      field: "word_english",
      minWidth: 130,
      editable: true,
    },
    {
      headerName: "Abbreviation",
      field: "word_abbr",
      width: 120,
      editable: true,
      cellStyle: { fontFamily: "monospace" },
    },
    {
      headerName: "Type",
      field: "word_type",
      width: 110,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: ["GENERAL", "SUFFIX", "PREFIX"] },
      cellRenderer: (p: { value: string }) => {
        if (p.value === "SUFFIX") return "Suffix"
        if (p.value === "PREFIX") return "Prefix"
        return "General"
      },
    },
    {
      headerName: "Forbidden",
      field: "is_forbidden",
      width: 90,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: ["true", "false"] },
      cellRenderer: (p: { value: string }) => p.value === "true" ? "Yes" : "",
      cellStyle: (p) => ({
        textAlign: "center",
        color: p.value === "true" ? "#ef4444" : undefined,
        fontWeight: p.value === "true" ? 600 : undefined,
      }),
    },
    {
      headerName: "Description",
      field: "description",
      minWidth: 200,
      flex: 1,
      editable: true,
    },
    {
      headerName: "Status",
      field: "status",
      width: 90,
      editable: true,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: ["ACTIVE", "INACTIVE", "DEPRECATED"] },
      cellRenderer: (p: { value: string }) => p.value === "ACTIVE" ? "Active" : p.value,
    },
    {
      headerName: "",
      field: "id",
      width: 45,
      maxWidth: 45,
      editable: false,
      sortable: false,
      cellRenderer: "deleteRenderer",
    },
  ], [])

  const components = useMemo(() => ({ deleteRenderer: WordDeleteRenderer }), [])

  return (
    <WordDeleteCtx.Provider value={deleteWord}>
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <p className="text-sm text-muted-foreground">{words.length} words</p>
        <div className="flex items-center gap-2">
          <ImportButton kind="word" dictId={dictId} onImported={fetchWords} />
          <Button variant="outline" size="sm" onClick={addWord}>
            <Plus className="h-3.5 w-3.5 mr-1" />Add
          </Button>
        </div>
      </div>
      <div
        className="ag-theme-alpine flex-1 min-h-0"
        style={{
          "--ag-font-family": "var(--font-d2coding), 'D2Coding', Consolas, monospace",
          "--ag-font-size": "13px",
        } as React.CSSProperties}
      >
        <AgGridReact
          ref={gridRef}
          columnDefs={columnDefs}
          rowData={words}
          defaultColDef={{
            resizable: true,
            sortable: true,
            filter: false,
            minWidth: 50,
          }}
          headerHeight={32}
          rowHeight={30}
          stopEditingWhenCellsLoseFocus
          onCellValueChanged={onCellValueChanged}
          animateRows={false}
          getRowId={(params) => String(params.data.id)}
          components={components}
        />
      </div>
    </div>
    </WordDeleteCtx.Provider>
  )
}

// ---------------------------------------------------------------------------
// Domains Tab (AG Grid — inline editing)
// ---------------------------------------------------------------------------

const DomainDeleteCtx = createContext<(id: number) => void>(() => {})

function DomainDeleteRenderer(props: { value: number }) {
  const onDelete = useContext(DomainDeleteCtx)
  return (
    <button type="button" onClick={() => onDelete(props.value)}
      className="flex items-center justify-center w-full h-full text-muted-foreground hover:text-destructive transition-colors cursor-pointer">
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}

function DomainsTab({ dictId }: { dictId: number }) {
  const [domains, setDomains] = useState<Domain[]>([])
  const gridRef = useRef<AgGridReact>(null)

  const fetchDomains = useCallback(async () => {
    const r = await authFetch(`${BASE}/domains?dictionary_id=${dictId}`)
    if (r.ok) setDomains(await r.json())
  }, [dictId])
  useEffect(() => { fetchDomains() }, [fetchDomains])

  const addDomain = useCallback(async () => {
    await authFetch(`${BASE}/domains`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dictionary_id: dictId, domain_name: "(new)", data_type: "VARCHAR" }),
    })
    await fetchDomains()
    setTimeout(() => {
      const api = gridRef.current?.api
      if (api) {
        const lastIdx = domains.length
        api.ensureIndexVisible(lastIdx)
        api.startEditingCell({ rowIndex: lastIdx, colKey: "domain_name" })
      }
    }, 200)
  }, [dictId, fetchDomains, domains.length])

  const deleteDomain = useCallback(async (id: number) => {
    await authFetch(`${BASE}/domains/${id}`, { method: "DELETE" })
    fetchDomains()
  }, [fetchDomains])

  const onCellValueChanged = useCallback(async (event: CellValueChangedEvent) => {
    const { data, colDef, newValue, oldValue } = event
    if (newValue === oldValue) return
    const field = colDef.field
    if (!field || !data.id) return
    await authFetch(`${BASE}/domains/${data.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: newValue }),
    })
  }, [])

  const columnDefs = useMemo<ColDef[]>(() => [
    { headerName: "#", valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1, width: 50, maxWidth: 55, editable: false, sortable: false, cellStyle: { color: "#9ca3af", textAlign: "right" } },
    { headerName: "Domain Name", field: "domain_name", minWidth: 120, editable: true, cellStyle: { fontWeight: 500 } },
    { headerName: "Group", field: "domain_group", width: 110, editable: true },
    { headerName: "Data Type", field: "data_type", width: 120, editable: true, cellStyle: { fontFamily: "monospace" } },
    { headerName: "Length", field: "data_length", width: 80, editable: true, cellStyle: { textAlign: "right" } },
    { headerName: "Precision", field: "data_precision", width: 90, editable: true, cellStyle: { textAlign: "right" } },
    { headerName: "Scale", field: "data_scale", width: 70, editable: true, cellStyle: { textAlign: "right" } },
    { headerName: "Description", field: "description", minWidth: 180, flex: 1, editable: true },
    { headerName: "Status", field: "status", width: 90, editable: true, cellEditor: "agSelectCellEditor", cellEditorParams: { values: ["ACTIVE", "INACTIVE", "DEPRECATED"] } },
    { headerName: "", field: "id", width: 45, maxWidth: 45, editable: false, sortable: false, cellRenderer: "deleteRenderer" },
  ], [])

  const components = useMemo(() => ({ deleteRenderer: DomainDeleteRenderer }), [])

  return (
    <DomainDeleteCtx.Provider value={deleteDomain}>
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <p className="text-sm text-muted-foreground">{domains.length} domains</p>
        <div className="flex items-center gap-2">
          <ImportButton kind="domain" dictId={dictId} onImported={fetchDomains} />
          <Button variant="outline" size="sm" onClick={addDomain}><Plus className="h-3.5 w-3.5 mr-1" />Add</Button>
        </div>
      </div>
      <div className="ag-theme-alpine flex-1 min-h-0" style={{ "--ag-font-family": "var(--font-d2coding), 'D2Coding', Consolas, monospace", "--ag-font-size": "13px" } as React.CSSProperties}>
        <AgGridReact ref={gridRef} columnDefs={columnDefs} rowData={domains}
          defaultColDef={{ resizable: true, sortable: true, filter: false, minWidth: 50 }}
          headerHeight={32} rowHeight={30} stopEditingWhenCellsLoseFocus
          onCellValueChanged={onCellValueChanged} animateRows={false}
          getRowId={(params) => String(params.data.id)} components={components} />
      </div>
    </div>
    </DomainDeleteCtx.Provider>
  )
}

// ---------------------------------------------------------------------------
// Terms Tab (AG Grid + morpheme analysis dialog)
// ---------------------------------------------------------------------------

const TermDeleteCtx = createContext<(id: number) => void>(() => {})

function TermDeleteRenderer(props: { value: number }) {
  const onDelete = useContext(TermDeleteCtx)
  return (
    <button type="button" onClick={() => onDelete(props.value)}
      className="flex items-center justify-center w-full h-full text-muted-foreground hover:text-destructive transition-colors cursor-pointer">
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}

function TermsTab({ dictId }: { dictId: number }) {
  const [terms, setTerms] = useState<Term[]>([])
  const [search, setSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [termName, setTermName] = useState("")
  const [analysis, setAnalysis] = useState<MorphemeResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  const fetchTerms = useCallback(async () => {
    const params = new URLSearchParams({ dictionary_id: String(dictId) })
    if (search) params.set("search", search)
    const r = await authFetch(`${BASE}/terms?${params}`)
    if (r.ok) setTerms(await r.json())
  }, [dictId, search])
  useEffect(() => { fetchTerms() }, [fetchTerms])

  const deleteTerm = useCallback(async (id: number) => {
    await authFetch(`${BASE}/terms/${id}`, { method: "DELETE" })
    fetchTerms()
  }, [fetchTerms])

  const onCellValueChanged = useCallback(async (event: CellValueChangedEvent) => {
    const { data, colDef, newValue, oldValue } = event
    if (newValue === oldValue) return
    const field = colDef.field
    if (!field || !data.id) return
    await authFetch(`${BASE}/terms/${data.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: newValue }),
    })
  }, [])

  const analyze = async () => {
    if (!termName.trim()) return
    setAnalyzing(true)
    const r = await authFetch(`${BASE}/terms/analyze?dictionary_id=${dictId}&term_name=${encodeURIComponent(termName)}`)
    if (r.ok) setAnalysis(await r.json())
    setAnalyzing(false)
  }

  const saveTerm = async () => {
    await authFetch(`${BASE}/terms`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dictionary_id: dictId, term_name: termName,
        term_english: analysis?.term_english, term_abbr: analysis?.term_abbr,
        physical_name: analysis?.physical_name,
        domain_id: analysis?.recommended_domain?.id || null,
      }),
    })
    setAddOpen(false); setTermName(""); setAnalysis(null); fetchTerms()
  }

  const columnDefs = useMemo<ColDef[]>(() => [
    { headerName: "#", valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1, width: 50, maxWidth: 55, editable: false, sortable: false, cellStyle: { color: "#9ca3af", textAlign: "right" } },
    { headerName: "Term Name", field: "term_name", minWidth: 130, editable: true, cellStyle: { fontWeight: 500 } },
    { headerName: "English", field: "term_english", minWidth: 150, editable: true },
    { headerName: "Abbreviation", field: "term_abbr", width: 130, editable: true, cellStyle: { fontFamily: "monospace" } },
    { headerName: "Physical Name", field: "physical_name", width: 140, editable: true, cellStyle: { fontFamily: "monospace" } },
    { headerName: "Domain", field: "domain_name", width: 100, editable: false, cellStyle: { color: "#6b7280" } },
    { headerName: "Type", field: "domain_data_type", width: 90, editable: false, cellStyle: { fontFamily: "monospace", color: "#6b7280" } },
    {
      headerName: "Words",
      field: "words",
      minWidth: 160,
      editable: false,
      cellRenderer: (p: { value: TermWord[] }) => {
        if (!p.value || p.value.length === 0) return ""
        return p.value.map((w) => w.word_name).join(" + ")
      },
      cellStyle: { color: "#6b7280", fontSize: "12px" },
    },
    { headerName: "Maps", field: "mapping_count", width: 65, editable: false, cellStyle: { textAlign: "center" } },
    { headerName: "Status", field: "status", width: 85, editable: true, cellEditor: "agSelectCellEditor", cellEditorParams: { values: ["ACTIVE", "INACTIVE", "DEPRECATED"] } },
    { headerName: "", field: "id", width: 45, maxWidth: 45, editable: false, sortable: false, cellRenderer: "deleteRenderer" },
  ], [])

  const components = useMemo(() => ({ deleteRenderer: TermDeleteRenderer }), [])

  return (
    <TermDeleteCtx.Provider value={deleteTerm}>
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="flex items-center gap-3 mb-3 flex-shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search terms..." className="h-8 pl-8 text-xs" />
        </div>
        <p className="text-sm text-muted-foreground">{terms.length} terms</p>
        <div className="flex items-center gap-2">
          <ImportButton kind="term" dictId={dictId} onImported={fetchTerms} />
          <Button variant="outline" size="sm" onClick={() => { setAddOpen(true); setTermName(""); setAnalysis(null) }}>
            <Plus className="h-3.5 w-3.5 mr-1" />Add
          </Button>
        </div>
      </div>
      <div className="ag-theme-alpine flex-1 min-h-0" style={{ "--ag-font-family": "var(--font-d2coding), 'D2Coding', Consolas, monospace", "--ag-font-size": "13px" } as React.CSSProperties}>
        <AgGridReact columnDefs={columnDefs} rowData={terms}
          defaultColDef={{ resizable: true, sortable: true, filter: false, minWidth: 50 }}
          headerHeight={32} rowHeight={30} stopEditingWhenCellsLoseFocus
          onCellValueChanged={onCellValueChanged} animateRows={false}
          getRowId={(params) => String(params.data.id)} components={components} />
      </div>

      {/* Add Term Dialog with Morpheme Analysis */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Term (형태소 분석)</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs">Term Name (한글)</Label>
                <Input value={termName} onChange={e => setTermName(e.target.value)} placeholder="고객전화번호" className="h-9" />
              </div>
              <div className="flex items-end">
                <Button onClick={analyze} disabled={analyzing || !termName.trim()} variant="outline" size="sm">
                  {analyzing ? "Analyzing..." : "Analyze"}
                </Button>
              </div>
            </div>

            {analysis && (
              <Card className="bg-muted/30">
                <CardContent className="p-4 space-y-3">
                  <div>
                    <span className="text-xs text-muted-foreground">Word Decomposition</span>
                    <div className="flex items-center gap-1 mt-1">
                      {analysis.words.map((w, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-muted-foreground">+</span>}
                          <Badge variant={w.word_type === "SUFFIX" ? "secondary" : "outline"} className="text-xs px-2 py-0.5">
                            {w.word_name} ({w.word_abbr})
                          </Badge>
                        </span>
                      ))}
                      {analysis.unmatched_parts.length > 0 && (
                        <Badge variant="destructive" className="text-xs px-2 py-0.5">
                          Unmatched: {analysis.unmatched_parts.join("")}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div><span className="text-muted-foreground">English</span><p className="font-medium">{analysis.term_english}</p></div>
                    <div><span className="text-muted-foreground">Abbreviation</span><p className="font-mono font-medium">{analysis.term_abbr}</p></div>
                    <div><span className="text-muted-foreground">Physical Name</span><p className="font-mono font-medium">{analysis.physical_name}</p></div>
                  </div>
                  {analysis.recommended_domain && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Recommended Domain</span>
                      <p className="font-medium">
                        {analysis.recommended_domain.domain_name}
                        <span className="text-muted-foreground ml-1">
                          ({analysis.recommended_domain.data_type}{analysis.recommended_domain.data_length ? `(${analysis.recommended_domain.data_length})` : ""})
                        </span>
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={saveTerm} disabled={!analysis}>Save Term</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </TermDeleteCtx.Provider>
  )
}

// ---------------------------------------------------------------------------
// Codes Tab
// ---------------------------------------------------------------------------

// Delete renderers for code grids
const CodeGroupDeleteCtx = createContext<(id: number) => void>(() => {})
function CodeGroupDeleteRenderer(props: { value: number }) {
  const onDelete = useContext(CodeGroupDeleteCtx)
  return (
    <button type="button" onClick={() => onDelete(props.value)}
      className="flex items-center justify-center w-full h-full text-muted-foreground hover:text-destructive transition-colors cursor-pointer">
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}

const CodeValueDeleteCtx = createContext<(id: number) => void>(() => {})
function CodeValueDeleteRenderer(props: { value: number }) {
  const onDelete = useContext(CodeValueDeleteCtx)
  return (
    <button type="button" onClick={() => onDelete(props.value)}
      className="flex items-center justify-center w-full h-full text-muted-foreground hover:text-destructive transition-colors cursor-pointer">
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}

function CodesTab({ dictId }: { dictId: number }) {
  const [groups, setGroups] = useState<CodeGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [values, setValues] = useState<CodeGroup["values"]>([])

  // Fetch groups
  const fetchGroups = useCallback(async () => {
    const r = await authFetch(`${BASE}/code-groups?dictionary_id=${dictId}`)
    if (r.ok) {
      const data = await r.json()
      setGroups(data)
      // Auto-select first group if none selected
      if (data.length > 0 && !selectedGroupId) setSelectedGroupId(data[0].id)
    }
  }, [dictId, selectedGroupId])
  useEffect(() => { fetchGroups() }, [fetchGroups])

  // Fetch values when group changes
  const fetchValues = useCallback(async () => {
    if (!selectedGroupId) { setValues([]); return }
    const r = await authFetch(`${BASE}/code-groups/${selectedGroupId}`)
    if (r.ok) {
      const data = await r.json()
      setValues(data.values || [])
    }
  }, [selectedGroupId])
  useEffect(() => { fetchValues() }, [fetchValues])

  // Group CRUD
  const addGroup = useCallback(async () => {
    await authFetch(`${BASE}/code-groups`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dictionary_id: dictId, group_name: "(new)" }),
    })
    await fetchGroups()
  }, [dictId, fetchGroups])

  const deleteGroup = useCallback(async (id: number) => {
    await authFetch(`${BASE}/code-groups/${id}`, { method: "DELETE" })
    if (selectedGroupId === id) setSelectedGroupId(null)
    fetchGroups()
  }, [selectedGroupId, fetchGroups])

  const onGroupCellChanged = useCallback(async (event: CellValueChangedEvent) => {
    const { data, colDef, newValue, oldValue } = event
    if (newValue === oldValue) return
    const field = colDef.field
    if (!field || !data.id) return
    await authFetch(`${BASE}/code-groups/${data.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: newValue }),
    })
  }, [])

  // Value CRUD
  const addValue = useCallback(async () => {
    if (!selectedGroupId) return
    await authFetch(`${BASE}/code-groups/${selectedGroupId}/values`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code_value: "(new)", code_name: "(new)" }),
    })
    fetchValues()
  }, [selectedGroupId, fetchValues])

  const deleteValue = useCallback(async (id: number) => {
    await authFetch(`${BASE}/code-values/${id}`, { method: "DELETE" })
    fetchValues()
  }, [fetchValues])

  const onValueCellChanged = useCallback(async (event: CellValueChangedEvent) => {
    const { data, colDef, newValue, oldValue } = event
    if (newValue === oldValue) return
    const field = colDef.field
    if (!field || !data.id) return
    await authFetch(`${BASE}/code-values/${data.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: newValue }),
    })
  }, [])

  // Group row click → select
  const onGroupRowClicked = useCallback((event: { data: { id: number } }) => {
    if (event.data?.id) setSelectedGroupId(event.data.id)
  }, [])

  const selectedGroup = groups.find(g => g.id === selectedGroupId)

  // Column defs
  const groupColDefs = useMemo<ColDef[]>(() => [
    { headerName: "#", valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1, width: 45, maxWidth: 45, editable: false, sortable: false, cellStyle: { color: "#9ca3af", textAlign: "right" } },
    { headerName: "Group Name", field: "group_name", flex: 1, minWidth: 120, editable: true, cellStyle: { fontWeight: 500 } },
    { headerName: "English", field: "group_english", flex: 1, minWidth: 100, editable: true },
    { headerName: "Status", field: "status", width: 85, editable: true, cellEditor: "agSelectCellEditor", cellEditorParams: { values: ["ACTIVE", "INACTIVE"] } },
    { headerName: "", field: "id", width: 40, maxWidth: 40, editable: false, sortable: false, cellRenderer: "deleteRenderer" },
  ], [])

  const valueColDefs = useMemo<ColDef[]>(() => [
    { headerName: "#", valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1, width: 45, maxWidth: 45, editable: false, sortable: false, cellStyle: { color: "#9ca3af", textAlign: "right" } },
    { headerName: "Code", field: "code_value", width: 100, editable: true, cellStyle: { fontFamily: "monospace", fontWeight: 500 } },
    { headerName: "Name (한글)", field: "code_name", flex: 1, minWidth: 120, editable: true },
    { headerName: "English", field: "code_english", flex: 1, minWidth: 100, editable: true },
    { headerName: "Order", field: "sort_order", width: 70, editable: true, cellStyle: { textAlign: "right" } },
    { headerName: "", field: "id", width: 40, maxWidth: 40, editable: false, sortable: false, cellRenderer: "deleteRenderer" },
  ], [])

  const groupComponents = useMemo(() => ({ deleteRenderer: CodeGroupDeleteRenderer }), [])
  const valueComponents = useMemo(() => ({ deleteRenderer: CodeValueDeleteRenderer }), [])

  return (
    <CodeGroupDeleteCtx.Provider value={deleteGroup}>
    <CodeValueDeleteCtx.Provider value={deleteValue}>
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Left: Code Groups */}
        <div className="flex flex-col w-2/5 min-h-0">
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <span className="text-sm font-medium text-muted-foreground">Code Groups</span>
            <div className="flex items-center gap-2">
              <ImportButton kind="code" dictId={dictId} onImported={() => { fetchGroups(); fetchValues() }} />
              <Button variant="outline" size="sm" onClick={addGroup}>
                <Plus className="h-3.5 w-3.5 mr-1" />Add
              </Button>
            </div>
          </div>
          <div className="ag-theme-alpine flex-1 min-h-0" style={{
            "--ag-font-family": "var(--font-d2coding), 'D2Coding', Consolas, monospace",
            "--ag-font-size": "13px",
            "--ag-selected-row-background-color": "rgba(59, 130, 246, 0.1)",
          } as React.CSSProperties}>
            <AgGridReact
              columnDefs={groupColDefs}
              rowData={groups}
              defaultColDef={{ resizable: true, sortable: false, filter: false, minWidth: 40 }}
              headerHeight={32} rowHeight={30}
              stopEditingWhenCellsLoseFocus
              onCellValueChanged={onGroupCellChanged}
              onRowClicked={onGroupRowClicked}
              rowSelection="single"
              animateRows={false}
              getRowId={(params) => String(params.data.id)}
              components={groupComponents}
            />
          </div>
        </div>

        {/* Right: Code Values */}
        <div className="flex flex-col w-3/5 min-h-0">
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <span className="text-sm font-medium text-muted-foreground">
              {selectedGroup ? `${selectedGroup.group_name} — Values` : "Select a group"}
            </span>
            {selectedGroupId && (
              <Button variant="outline" size="sm" onClick={addValue}>
                <Plus className="h-3.5 w-3.5 mr-1" />Add Value
              </Button>
            )}
          </div>
          <div className="ag-theme-alpine flex-1 min-h-0" style={{
            "--ag-font-family": "var(--font-d2coding), 'D2Coding', Consolas, monospace",
            "--ag-font-size": "13px",
          } as React.CSSProperties}>
            {selectedGroupId ? (
              <AgGridReact
                columnDefs={valueColDefs}
                rowData={values}
                defaultColDef={{ resizable: true, sortable: false, filter: false, minWidth: 40 }}
                headerHeight={32} rowHeight={30}
                stopEditingWhenCellsLoseFocus
                onCellValueChanged={onValueCellChanged}
                animateRows={false}
                getRowId={(params) => String(params.data.id)}
                components={valueComponents}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Select a code group to view values
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </CodeValueDeleteCtx.Provider>
    </CodeGroupDeleteCtx.Provider>
  )
}

// ---------------------------------------------------------------------------
// Compliance Tab
// ---------------------------------------------------------------------------

function ComplianceTab({ dictId }: { dictId: number }) {
  const [stats, setStats] = useState<ComplianceStats | null>(null)

  useEffect(() => {
    authFetch(`${BASE}/compliance?dictionary_id=${dictId}`)
      .then(r => r.json()).then(setStats).catch(() => {})
  }, [dictId])

  if (!stats) return <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
  if (stats.total_columns === 0) return <p className="text-sm text-muted-foreground text-center py-8">No columns mapped yet.</p>

  const pct = stats.compliance_rate

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6">
          <div className="text-center mb-4">
            <p className="text-4xl font-bold">{pct}%</p>
            <p className="text-sm text-muted-foreground">Standard Compliance Rate</p>
          </div>
          <div className="w-full bg-muted rounded-full h-4 mb-4">
            <div className="bg-green-500 h-4 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="grid grid-cols-5 gap-4 text-center text-sm">
            <div><p className="text-lg font-semibold">{stats.total_columns}</p><p className="text-muted-foreground">Total</p></div>
            <div><p className="text-lg font-semibold text-green-600">{stats.matched}</p><p className="text-muted-foreground">Matched</p></div>
            <div><p className="text-lg font-semibold text-amber-600">{stats.similar}</p><p className="text-muted-foreground">Similar</p></div>
            <div><p className="text-lg font-semibold text-red-600">{stats.violation}</p><p className="text-muted-foreground">Violation</p></div>
            <div><p className="text-lg font-semibold text-gray-400">{stats.unmapped}</p><p className="text-muted-foreground">Unmapped</p></div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function WordTypeBadge({ type }: { type: string }) {
  if (type === "SUFFIX") return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 text-[10px] px-1.5 py-0 border-0">Suffix</Badge>
  if (type === "PREFIX") return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-[10px] px-1.5 py-0 border-0">Prefix</Badge>
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0">General</Badge>
}
