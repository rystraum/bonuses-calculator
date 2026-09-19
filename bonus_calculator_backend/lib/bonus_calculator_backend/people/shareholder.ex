defmodule BonusCalculatorBackend.People.Shareholder do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "shareholders" do
    field :name, :string
    field :shares, :integer

    belongs_to :employee, BonusCalculatorBackend.People.Employee

    timestamps(type: :utc_datetime)
  end

  def changeset(shareholder, attrs) do
    shareholder
    |> cast(attrs, [:name, :shares, :employee_id])
    |> validate_required([:name, :shares])
    |> validate_number(:shares, greater_than: 0)
    |> foreign_key_constraint(:employee_id)
  end
end
