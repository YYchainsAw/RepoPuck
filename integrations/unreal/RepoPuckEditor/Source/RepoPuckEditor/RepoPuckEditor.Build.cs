using UnrealBuildTool;

public class RepoPuckEditor : ModuleRules
{
    public RepoPuckEditor(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PrivateDependencyModuleNames.AddRange(
            new[]
            {
                "Core",
                "HTTP"
            }
        );
    }
}
