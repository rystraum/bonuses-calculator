defmodule BonusCalculatorBackend.People.Employee do
  use Ecto.Schema
  import Ecto.Changeset

  @classifications ["full_time", "contractual", "professional"]

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "employees" do
    field :name, :string
    field :classification, :string
    field :archived_at, :utc_datetime

    field :archived, :boolean, virtual: true

    has_many :shareholders, BonusCalculatorBackend.People.Shareholder

    timestamps(type: :utc_datetime)
  end

  def classifications, do: @classifications

  def changeset(employee, attrs) do
    employee
    |> cast(attrs, [:name, :classification, :archived])
    |> validate_required([:name])
    |> validate_inclusion(:classification, @classifications)
    |> apply_archived()
  end

  defp apply_archived(changeset) do
    case get_change(changeset, :archived) do
      nil ->
        changeset

      true ->
        put_change(changeset, :archived_at, DateTime.utc_now() |> DateTime.truncate(:second))

      false ->
        put_change(changeset, :archived_at, nil)
    end
  end
end
