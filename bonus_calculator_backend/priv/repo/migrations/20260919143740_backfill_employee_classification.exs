defmodule BonusCalculatorBackend.Repo.Migrations.BackfillEmployeeClassification do
  use Ecto.Migration

  def up do
    execute("""
    UPDATE employees SET classification =
      CASE
        WHEN EXISTS (
          SELECT 1 FROM employee_group_memberships m
          JOIN employee_groups g ON g.id = m.employee_group_id
          WHERE m.employee_id = employees.id AND g.name = 'FTE'
        ) THEN 'full_time'
        WHEN EXISTS (
          SELECT 1 FROM employee_group_memberships m
          JOIN employee_groups g ON g.id = m.employee_group_id
          WHERE m.employee_id = employees.id AND g.name = 'Contractuals'
        ) THEN 'contractual'
        WHEN EXISTS (
          SELECT 1 FROM employee_group_memberships m
          JOIN employee_groups g ON g.id = m.employee_group_id
          WHERE m.employee_id = employees.id AND g.name = 'Board'
        ) THEN 'professional'
      END
    WHERE classification IS NULL
    """)
  end

  def down, do: :ok
end
