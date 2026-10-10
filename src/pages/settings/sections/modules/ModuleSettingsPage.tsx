import { Navigate, useParams } from "react-router-dom";
import { MODULE_SETTINGS_REGISTRY } from "../../moduleSettingsRegistry";
import { useAuth } from "../../../../contexts/AuthContext";
import { ModuleConfigForm } from "./ModuleConfigForm";

/** Rota única das configurações dos módulos verticais: /app/configuracoes/modulos/:moduleId/:sectionId */
export function ModuleSettingsPage() {
  const { moduleId, sectionId } = useParams();
  const { isModuleEnabled } = useAuth();
  const mod = MODULE_SETTINGS_REGISTRY.find((m) => m.moduleId === moduleId);
  if (!mod || !isModuleEnabled(mod.moduleId)) return <Navigate to="/app/configuracoes" replace />;
  const section = mod.sections.find((s) => s.id === sectionId) ?? mod.sections[0];
  return <ModuleConfigForm key={`${mod.moduleId}/${section.id}`} module={mod} section={section} />;
}
